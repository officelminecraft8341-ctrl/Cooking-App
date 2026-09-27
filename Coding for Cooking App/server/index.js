import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  passwordProblems,
  isBreachedPassword,
  generateTotpSecret,
  totpCode,
  verifyTotp,
  otpauthUri,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  verifyChallenge,
  createChallenge,
  ensureCaptchaKey,
  makeCaptcha,
  verifyCaptcha,
  loginGuardCheck,
  loginGuardFail,
  loginGuardSuccess,
  redactEmail,
} from '../shared/authShared.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Config ────────────────────────────────────────────────────────────────
const API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
const AI_URL = process.env.AI_URL || 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.AI_MODEL || 'cohere/north-mini-code:free';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);

// Embeddings (semantic search) — OpenAI-compatible /embeddings endpoint
const EMBED_API_KEY = process.env.EMBED_API_KEY || API_KEY;
const EMBED_URL = process.env.EMBED_URL || 'https://ai.hackclub.com/proxy/v1/embeddings';
const EMBED_MODEL = process.env.EMBED_MODEL || 'liquid/lfm-2.5-embedding-350m:free';

// Vision — multimodal model for photo → ingredients / photo → dish recognition
const VISION_MODEL = process.env.VISION_MODEL || 'qwen/qwen2.5-vl-72b-instruct';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length === 0) return true; // dev default: same-origin via Vite proxy
  return ALLOWED_ORIGINS.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Security headers ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Fonts are self-hosted (public/fonts) — no third-party origins at all.
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  next();
});

// ─── Session cookie helpers (httpOnly — never exposed to JS/XSS) ────────────
const SESSION_COOKIE = 'chefai_session';
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // matches SESSION_TTL_MS

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_COOKIE_MAX_AGE}${IS_PROD ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${IS_PROD ? '; Secure' : ''}`);
}

function tokenFromRequest(req) {
  const cookie = req.headers.cookie || '';
 const pair = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (pair) return decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1));
  // Deprecated transport kept only for API clients during the migration window.
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// ─── CSRF defense-in-depth (SameSite=Strict is the primary layer) ───────────
// Every state-changing /api request must originate from this site. Browsers
// always attach Origin on cross-site POSTs; curl/API clients omit it.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser client
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    if (new URL(origin).host !== host) {
      return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
  } catch {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  next();
});

// ─── Rate limiting (AI cost protection + brute-force defense) ────────────────
const aiLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many AI requests. Try again in a minute.' } });
// Login/2FA verify: 5 attempts per 15 min per IP (audit spec), on top of the
// per-account lockout + captcha layers. Limits are env-overridable so the
// integration tests can exercise the account-level guards without tripping
// the per-IP circuit; production defaults are the audit values.
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: Number(process.env.LOGIN_RATE_MAX) || 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
const signupLimiter = rateLimit({ windowMs: 15 * 60_000, max: Number(process.env.SIGNUP_RATE_MAX) || 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: Number(process.env.AUTH_RATE_MAX) || 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' } });

for (const route of ['/api/embed', '/api/recipes/generate', '/api/recipes/ideas', '/api/vision', '/api/chat']) {
  app.use(route, aiLimiter);
}
for (const route of ['/api/auth/login', '/api/auth/2fa/verify']) {
  app.use(route, loginLimiter);
}
app.use('/api/auth/signup', signupLimiter);
app.use('/api/auth', authLimiter);

// ─── In-memory recipe store — per-user buckets + legacy shared bucket ─────
let savedRecipes = []; // shared/unauthenticated bucket (pre-auth era)
let nextId = 1;
const recipesByUser = new Map(); // email → recipe array

function bucketFor(req) {
  const user = userForToken(req);
  if (!user) return savedRecipes;
  if (!recipesByUser.has(user.email)) recipesByUser.set(user.email, []);
  return recipesByUser.get(user.email);
}

// ─── Auth: users + sessions, persisted to server/data.json ─────────────────
const DATA_FILE = process.env.CHEFAI_DATA_FILE
  ? path.resolve(process.env.CHEFAI_DATA_FILE)
  : new URL('./data.json', import.meta.url);
const authStore = { users: [], sessions: {} };

function persistAuth() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(authStore, null, 2), { mode: 0o600 }); } catch { /* read-only fs is non-fatal */ }
}

function loadAuth() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(raw.users)) authStore.users = raw.users;
    if (raw.sessions && typeof raw.sessions === 'object') authStore.sessions = raw.sessions;
  } catch { /* first boot */ }
}
loadAuth();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  // Store a hash of the token, never the token itself, so a data-file leak
  // cannot be replayed as a live session.
  authStore.sessions[hashToken(token)] = { email, createdAt: Date.now() };
  persistAuth();
  return token;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function userForToken(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const session = authStore.sessions[hashToken(token)];
  if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
    if (session) { delete authStore.sessions[hashToken(token)]; persistAuth(); }
    return null;
  }
  return authStore.users.find((u) => u.email === session.email) || null;
}

function publicUser(user) {
  return { email: user.email, name: user.name || user.email.split('@')[0], createdAt: user.createdAt };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function callAI(messages, model = MODEL) {
  if (!API_KEY) {
    throw new Error('Missing AI API key. Set OPENAI_API_KEY or AI_API_KEY in your environment.');
  }

  const response = await fetch(AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}

// ─── Embeddings helper ───────────────────────────────────────────────────
async function callEmbeddings(input) {
  if (!EMBED_API_KEY) {
    throw new Error('Missing embeddings API key. Set EMBED_API_KEY or OPENAI_API_KEY in your environment.');
  }

  const response = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMBED_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embeddings API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Embeddings API returned no embedding vector');
  }
  return embedding;
}

// ─── POST /api/embed — proxy for semantic search (keeps the key server-side) ──
// Takes: { input: string } → { embedding: number[] , model: string }
app.post('/api/embed', async (req, res) => {
  const { input } = req.body || {};
  const text = typeof input === 'string' ? input.trim() : '';

  if (!text) {
    return res.status(400).json({ error: 'input text is required' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: 'input text is too long (max 4000 characters)' });
  }

  try {
    const embedding = await callEmbeddings(text);
    res.json({ embedding, model: EMBED_MODEL });
  } catch (error) {
    console.error('Embeddings error:', error.message);
    res.status(502).json({ error: error.message || 'Embeddings request failed' });
  }
});

// ─── POST /api/recipes/ideas — 3 dish concepts across a complexity range ────
app.post('/api/recipes/ideas', async (req, res) => {
  const {
    prompt = '',
    ingredients = [],
    cuisines = [],
    diet = '',
    time = '',
    servings = 2,
  } = req.body || {};

  const ingredientsList = ingredients.length > 0 ? ingredients.join(', ') : prompt || 'whatever you think is best';
  const cuisineList = cuisines.length > 0 ? cuisines.join(' and ') : '';

  try {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const content = await callAI([
        {
          role: 'system',
          content: `You are ChefAI, a creative culinary director. Given a set of constraints, propose exactly 3 distinct dish concepts that range in complexity: one SIMPLE (beginner-friendly, minimal technique), one INTERMEDIATE (moderate technique), and one AMBITIOUS (impressive, multi-technique showstopper). Each must satisfy the user's constraints.

CRITICAL: Respond with ONLY valid JSON — no markdown fences, no commentary. Structure:
{
  "ideas": [
    { "id": "simple", "title": "Dish name", "description": "One appetizing sentence", "complexity": "Simple", "time": "25 min", "keyTwist": "What makes this version special" },
    { "id": "intermediate", ... "complexity": "Intermediate", ... },
    { "id": "ambitious", ... "complexity": "Ambitious", ... }
  ]
}`,
        },
        {
          role: 'user',
          content: [
            `Propose 3 dish concepts with these constraints:`,
            `- Ingredients available: ${ingredientsList}`,
            cuisineList ? `- Cuisine: ${cuisineList}` : '',
            diet ? `- Dietary requirement: ${diet}` : '',
            time ? `- Target cook time: ${time}` : '',
            `- Servings: ${servings}`,
          ].filter(Boolean).join('\n'),
        },
      ]);

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
      }

      try {
        const data = JSON.parse(cleaned);
        const ideas = Array.isArray(data?.ideas) ? data.ideas.filter((idea) => idea?.title) : [];
        if (ideas.length === 0) throw new Error('No ideas in response');
        return res.json({ ideas });
      } catch (parseError) {
        lastError = parseError;
        console.warn(`Ideas JSON parse failed (attempt ${attempt + 1}/2): ${parseError.message}`);
      }
    }
    throw lastError || new Error('Model returned unparseable response');
  } catch (error) {
    console.error('Recipe ideas failed:', error.message);
    return res.status(500).json({ error: 'Failed to brainstorm ideas. Please try again.' });
  }
});

// ─── POST /api/recipes/generate ─────────────────────────────────────────
// Takes: { prompt, ingredients, cuisines, diet, time, servings, pantryItems, difficulty, strictMode, accessibility, modifyRequest }
app.post('/api/recipes/generate', async (req, res) => {
  const {
    prompt = '',
    ingredients = [],
    cuisines = [],
    diet = '',
    time = '',
    servings = 2,
    pantryItems = [],
    difficulty = 'Any',
    strictMode = false,
    accessibility = '',
    modifyRequest = null, // { action, target, message, existingRecipe }
    imageIngredients = null, // { images: [dataURL], note?: string } — photo → auto-find recipe
  } = req.body;

  let systemPrompt = `You are ChefAI, an elite culinary expert and nutritionist. Your job is to generate complete, realistic, exceptionally detailed, and delicious recipes. 

CRITICAL: You MUST respond with ONLY valid JSON. No markdown fences like \`\`\`json, no backticks, no explanation text — just the raw JSON object.

The JSON must have exactly this structure:
{
  "title": "Creative, appetizing recipe name",
  "description": "A mouth-watering two-sentence description of the dish and its flavor profile.",
  "time": "X min/hours",
  "difficulty": "Easy|Medium|Hard",
  "servings": number,
  "tag": "short category tag e.g. High Protein, Vegan, Comfort, etc.",
  "cuisine": "cuisine type (or fusion description)",
  "diet": ["list of applicable diets"],
  "ingredients": [
    { "name": "ingredient name", "amount": "specific quantity e.g. 2 cups, 1 tbsp, 400g" }
  ],
  "instructions": [
    "Step 1: clear, highly specific instruction including heat levels, timing, and visual cues",
    "Step 2: ...",
    "..."
  ],
  "nutrition": {
    "calories": number,
    "protein": "Xg",
    "carbs": "Xg",
    "fat": "Xg",
    "fiber": "Xg",
    "sodium": "Xmg"
  },
  "tips": "One or two expert cooking techniques or plating tips",
  "substitutions": [
    "Ingredient → substitute option and brief reason"
  ],
  "tutorials": {
    "videoQuery": "short search phrase for finding a video tutorial, e.g. 'how to sear scallops like a chef'",
    "articleQuery": "short search phrase for finding an in-depth article or guide, e.g. 'scallops searing temperature guide'"
  }
}

Rules:
- DO NOT write lazy or generic recipes. Use specific techniques, accurate temperatures, and proper culinary terms.
- Nutrition values MUST be calculated accurately based on the exact ingredients and amounts provided.
- Instructions must be specific and numbered clearly. Include at least 5 steps.
- Include at least 5 ingredients, up to 15.
- Substitutions should address dietary swaps or common pantry alternatives.
- The tutorials queries MUST be generic search phrases for learning the CORE TECHNIQUE of the dish, not the dish name alone.`;

  let userContent = '';

  if (modifyRequest) {
    // Handling a modification to an existing recipe
    const { action, target, message, existingRecipe } = modifyRequest;
    
    systemPrompt += `\n\nYou are modifying an existing recipe. Make the requested change while preserving the core of the recipe as much as possible, then recalculate nutrition and instructions accordingly.`;
    
    userContent = `Here is the current recipe:
${JSON.stringify(existingRecipe, null, 2)}

Modification requested: `;

    if (action === 'remove') {
      userContent += `Remove the ingredient "${target}" entirely. Adjust the recipe so it still works without it.`;
    } else if (action === 'substitute') {
      userContent += `Substitute the ingredient "${target}" with a suitable alternative. Adjust instructions and nutrition.`;
    } else if (action === 'feedback') {
      userContent += `The user provided this feedback: "${message}". Please adjust the recipe accordingly.`;
    }

  } else {
    // New recipe generation
    const ingredientsList = ingredients.length > 0 ? ingredients.join(', ') : prompt || 'whatever you think is best';
    const cuisineList = cuisines.length > 0 ? cuisines.join(' and ') + ' fusion' : '';

    const { ideaId, ideaTitle, ideaComplexity, ideaTwist } = req.body.idea || {};
    if (ideaTitle) {
      systemPrompt += `\n\nThe user has already chosen this dish concept from a set of ideas — develop EXACTLY this dish, do not substitute a different one:
Title: ${ideaTitle}
Complexity target: ${ideaComplexity || 'as proposed'}
What makes it special: ${ideaTwist || 'as proposed'}`;
    }

    if (strictMode) {
      systemPrompt += `\n\nCRITICAL STRICT MODE: You are FORBIDDEN from using any ingredients that are not explicitly listed by the user, except for absolute basics like salt, pepper, cooking oil, and water.`;
    }

    if (accessibility) {
      systemPrompt += `\n\nCRITICAL ACCESSIBILITY NEED: The user has indicated this disability/accessibility need: "${accessibility}". 
You MUST heavily adapt the instructions, cooking methods, and required tools to accommodate this limitation safely and easily. Do not suggest techniques that violate this need.`;
    }

    userContent = [
      `Create an exceptional recipe with these constraints:`,
      ingredientsList ? `- Ingredients available: ${ingredientsList}` : '',
      cuisineList ? `- Cuisine: ${cuisineList}` : '',
      diet ? `- Dietary requirement: ${diet}` : '',
      time ? `- Target cook time: ${time}` : '',
      difficulty !== 'Any' ? `- Difficulty level: ${difficulty}` : '',
      servings ? `- Servings: ${servings}` : '',
      pantryItems.length > 0 ? `- The user has these pantry items, prioritize using them: ${pantryItems.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // Photo → auto-find a recipe: identify the dish, then generate its full recipe.
    // Runs inside generate so the user keeps every constraint (diet, time, servings…).
    if (imageIngredients?.images?.length) {
      let images = [];
      try { images = parseDataImages(imageIngredients.images); } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      try {
        const identified = await callAI([{ role: 'user', content: visionContent(
          'Identify the dish shown in this photo. Respond with ONLY a JSON object: {"dish": "specific dish name", "notes": "one sentence on how it appears to be prepared"}. If it is not food, return {"dish": null}.',
          images,
        ) }], VISION_MODEL);
        const cleaned = identified.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : cleaned);
        if (!parsed.dish) {
          return res.status(422).json({ error: 'Could not find a dish in that photo — try a closer shot of the food.' });
        }
        userContent += `\n- The user photographed a dish they want to make but could not find a recipe for. Identify it as "${parsed.dish}" (${parsed.notes || 'as pictured'}) and generate the recipe for THAT dish, honoring all other constraints above.`;
      } catch (error) {
        console.error('Vision dish identification failed:', error.message);
        return res.status(502).json({ error: 'Could not analyze the photo. Please try again.' });
      }
    }
  }

  try {
    let lastError = null;
    // The model occasionally returns malformed JSON — retry once before failing
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const content = await callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: attempt === 0 ? userContent : `${userContent}\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY the raw JSON object again.` },
      ]);

      let cleaned = content.trim();
      // Strip markdown fences robustly
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
      }

      try {
        const recipe = JSON.parse(cleaned);

        // Build learning links: AI-provided queries → search URLs (real sources,
        // not just one site) + deterministic fallbacks if the model skipped them
        const title = recipe.title || 'this dish';
        const videoQuery = recipe.tutorials?.videoQuery || `how to make ${title}`;
        const articleQuery = recipe.tutorials?.articleQuery || `${title} recipe technique guide`;
        recipe.tutorials = {
          videoQuery,
          articleQuery,
          videoUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(videoQuery)}`,
          articleUrl: `https://www.google.com/search?q=${encodeURIComponent(articleQuery)}`,
        };

        return res.json({ recipe });
      } catch (parseError) {
        lastError = parseError;
        console.warn(`Recipe JSON parse failed (attempt ${attempt + 1}/2): ${parseError.message}`);
      }
    }

    throw lastError || new Error('Model returned unparseable response');
  } catch (error) {
    console.error('Recipe generation failed:', error);
    return res.status(500).json({ error: 'Failed to generate recipe. Please try again.', details: error.message });
  }
});

// ─── Vision helpers ──────────────────────────────────────────────────────────
const MAX_IMAGE_CHARS = 4_000_000; // ~3MB base64 — data URLs only, nothing stored

function visionContent(text, images) {
  const parts = [{ type: 'text', text }];
  (images || []).forEach((url) => parts.push({ type: 'image_url', image_url: { url } }));
  return parts;
}

function parseDataImages(rawImages) {
  const images = Array.isArray(rawImages) ? rawImages : [];
  if (images.length > 3) throw new Error('Too many images (max 3)');
  return images.map((url) => {
    if (typeof url !== 'string' || !url.startsWith('data:image/')) {
      throw new Error('Images must be data URLs (data:image/...)');
    }
    if (url.length > MAX_IMAGE_CHARS) throw new Error('Image is too large (max ~3MB)');
    return url;
  });
}

// ─── POST /api/vision/pantry — photo of groceries/fridge → ingredient list ──
app.post('/api/vision/pantry', async (req, res) => {
  try {
    const images = parseDataImages(req.body?.images);
    if (images.length === 0) return res.status(400).json({ error: 'At least one image is required' });

    const content = visionContent(
      'You are a grocery identification expert. Look at the photo(s) of food, groceries, a fridge, or a pantry. ' +
      'List every distinct edible ingredient you can confidently identify. Respond with ONLY a JSON object: ' +
      '{"ingredients": ["ingredient 1", "ingredient 2"]}. Use simple lowercase singular/plural names a person would type ' +
      '(e.g. "eggs", "spinach", "chicken breast", "parmesan"). Include counts only when visible (e.g. "3 tomatoes"). ' +
      'Ignore packaging brands, condensation, shelves, and non-food items. If the photo has no identifiable food, return {"ingredients": []}.',
      images,
    );

    const reply = await callAI([{ role: 'user', content }], VISION_MODEL);
    const cleaned = reply.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    const ingredients = Array.isArray(parsed.ingredients)
      ? parsed.ingredients.filter((i) => typeof i === 'string' && i.trim()).map((i) => i.trim()).slice(0, 40)
      : [];
    res.json({ ingredients });
  } catch (error) {
    console.error('Vision pantry failed:', error.message);
    const status = error.message.startsWith('Images must') || error.message.includes('Too many') || error.message.includes('too large') ? 400 : 502;
    res.status(status).json({ error: error.message || 'Could not analyze the photo' });
  }
});

// ─── POST /api/vision/dish — photo of a dish → name + description for search ─
app.post('/api/vision/dish', async (req, res) => {
  try {
    const images = parseDataImages(req.body?.images);
    if (images.length === 0) return res.status(400).json({ error: 'At least one image is required' });

    const content = visionContent(
      'Identify the dish in this photo. Respond with ONLY a JSON object: ' +
      '{"dish": "specific dish name", "description": "one sentence describing it", ' +
      '"keyIngredients": ["3-8 likely ingredients"]}. If it is not food, return {"dish": null}.',
      images,
    );

    const reply = await callAI([{ role: 'user', content }], VISION_MODEL);
    const cleaned = reply.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    res.json({ dish: parsed.dish || null, description: parsed.description || '', keyIngredients: Array.isArray(parsed.keyIngredients) ? parsed.keyIngredients : [] });
  } catch (error) {
    console.error('Vision dish failed:', error.message);
    const status = error.message.startsWith('Images must') || error.message.includes('Too many') || error.message.includes('too large') ? 400 : 502;
    res.status(status).json({ error: error.message || 'Could not analyze the photo' });
  }
});

// ─── POST /api/chat ────────────────────────────────────────────────────────
// Takes: { message, history, recipe }
// history = [{ role: 'user'|'assistant', content: string }]
// recipe = the current active recipe object (optional)
app.post('/api/chat', async (req, res) => {
  const { message, history = [], recipe, images: rawImages, savedRecipes = [] } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let images = [];
  try {
    images = parseDataImages(rawImages);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const recipeContext = recipe
    ? `The user is currently looking at this recipe:
Title: ${recipe.title}
Ingredients: ${Array.isArray(recipe.ingredients)
  ? recipe.ingredients.map((i) => (typeof i === 'object' ? `${i.amount} ${i.name}` : i)).join(', ')
  : recipe.ingredients || 'N/A'}
Instructions: ${Array.isArray(recipe.instructions) ? recipe.instructions.join(' | ') : recipe.instructions || 'N/A'}
Diet tags: ${Array.isArray(recipe.diet) ? recipe.diet.join(', ') : recipe.diet || 'N/A'}
Nutrition: ${recipe.nutrition ? JSON.stringify(recipe.nutrition) : 'N/A'}`
    : 'No specific recipe is currently active.';

  const savedContext = Array.isArray(savedRecipes) && savedRecipes.length > 0
    ? `\nThe user's saved recipes (they may reference or ask to switch to any of these by name):
${savedRecipes.slice(0, 20).map((r) => `- ${r.title}`).join('\n')}

If the user asks to switch to, work on, or talk about a different one of their saved recipes, end your reply with a line in exactly this format:
[SWITCH_RECIPE: <exact title from the list above>]
Only include the directive when they clearly want to change which recipe is in context.`
    : '';

  const systemPrompt = `You are ChefAI, a warm and knowledgeable cooking assistant. You help users with:
- Recipe ideas based on ingredients they have
- Cooking techniques and tips
- Ingredient substitutions
- Dietary adjustments (making things vegan, gluten-free, etc.)
- Scaling recipes up or down
- Nutrition questions
- Timing and equipment advice

Context about the current session:
${recipeContext}

Keep responses helpful, concise, and friendly. Use bullet points when listing multiple items. 
If someone asks you to generate a full recipe, tell them to use the "Create a recipe" feature for a full structured recipe.
Never make up specific medical or allergy advice — always suggest consulting a professional for serious dietary needs.
${savedContext}`;

  // Build conversation history (limit to last 10 messages to keep tokens manageable)
  const recentHistory = history.slice(-10);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: images.length > 0 ? visionContent(message, images) : message },
  ];

  try {
    const reply = await callAI(messages, images.length > 0 ? VISION_MODEL : MODEL);
    return res.json({ reply });
  } catch (error) {
    console.error('Chat failed:', error.message);
    return res.status(500).json({ error: 'Chat is temporarily unavailable. Please try again.' });
  }
});

// ─── GET /api/recipes — the caller's collection (shared bucket when signed out)
app.get('/api/recipes', (req, res) => {
  res.json(bucketFor(req));
});

// ─── POST /api/recipes ───────────────────────────────────────────────────────
app.post('/api/recipes', (req, res) => {
  const recipe = req.body;
  if (!recipe?.title) {
    return res.status(400).json({ error: 'Recipe must have a title' });
  }

  const bucket = bucketFor(req);
  const exists = bucket.some((r) => r.title === recipe.title);
  if (exists) {
    return res.json({ message: 'Recipe already saved', recipe: bucket.find((r) => r.title === recipe.title) });
  }

  const saved = { ...recipe, id: nextId++, savedAt: new Date().toISOString(), isFavorite: false };
  bucket.push(saved);
  return res.status(201).json({ recipe: saved });
});

// ─── PUT /api/recipes/:id/favorite ──────────────────────────────────────────
app.put('/api/recipes/:id/favorite', (req, res) => {
  const bucket = bucketFor(req);
  const id = parseInt(req.params.id, 10);
  const recipe = bucket.find((r) => r.id === id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  recipe.isFavorite = !recipe.isFavorite;
  res.json({ recipe });
});

// ─── DELETE /api/recipes/:id ─────────────────────────────────────────────────
app.delete('/api/recipes/:id', (req, res) => {
  const bucket = bucketFor(req);
  const id = parseInt(req.params.id, 10);
  const index = bucket.findIndex((r) => r.id === id);
  if (index === -1) return res.status(404).json({ error: 'Recipe not found' });
  bucket.splice(index, 1);
  res.json({ success: true });
});

// ─── Auth: signup / login / 2FA / me / logout ───────────────────────────────

function requireCaptchaKey() {
  return ensureCaptchaKey(API_KEY || 'chefai-dev-pepper');
}

function loginGuardKey(req, email) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  return `${String(email || '').toLowerCase()}|${ip}`;
}

function logAuthEvent(event, details) {
  // Failed-attempt log (audit item 4). Never logs passwords or full emails.
  console.warn(`[auth] ${event}`, JSON.stringify(details));
}

function publicCaptcha(captcha) {
  // The answer must never reach the client — only id + question.
  return { id: captcha.id, question: captcha.question };
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, ageConfirmed, ageYears } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  // COPPA-style age gate: the user must affirmatively confirm their age and
  // be at least 13. Only the confirmation boolean is stored.
  if (ageConfirmed !== true) {
    return res.status(400).json({ error: 'Please confirm your age to continue' });
  }
  if (Number.isFinite(Number(ageYears)) && Number(ageYears) > 0 && Number(ageYears) < 13) {
    logAuthEvent('signup-age-block', { domain: normalizedEmail.split('@')[1] });
    return res.status(403).json({ error: 'ChefAI is only available for users 13 and older' });
  }

  const problems = passwordProblems(password, { email: normalizedEmail });
  if (problems.length > 0) {
    return res.status(400).json({ error: problems[0], problems });
  }
  if (await isBreachedPassword(password)) {
    return res.status(400).json({ error: 'That password appears in known data breaches — please choose a unique one' });
  }
  if (authStore.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists — sign in instead' });
  }

  const user = {
    email: normalizedEmail,
    name: String(name || '').trim() || normalizedEmail.split('@')[0],
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
    ageConfirmed: true,
  };
  authStore.users.push(user);
  // Seed the new account's collection with anything saved pre-auth (shared bucket)
  recipesByUser.set(normalizedEmail, savedRecipes.map((r) => ({ ...r })));
  persistAuth();

  const token = createSession(normalizedEmail);
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, totp, backupCode, captchaId, captchaAnswer, challenge } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const guardKey = loginGuardKey(req, normalizedEmail);

  const guard = loginGuardCheck(guardKey);
  if (!guard.allowed) {
    logAuthEvent('login-locked', { account: redactEmail(normalizedEmail), retryAfter: guard.retryAfter });
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${guard.retryAfter}s.`, lockedFor: guard.retryAfter });
  }
  if (guard.captchaRequired) {
    await requireCaptchaKey();
    if (!(await verifyCaptcha(captchaId, captchaAnswer))) {
      return res.status(401).json({ error: 'Please solve the captcha to continue', captcha: publicCaptcha(await makeCaptcha()), requiresCaptcha: true });
    }
  }

  const user = authStore.users.find((u) => u.email === normalizedEmail);
  const passwordOk = user && verifyPassword(String(password || ''), user.passwordHash);
  if (!passwordOk) {
    const { count, lockedForMs } = loginGuardFail(guardKey);
    logAuthEvent('login-failed', { account: redactEmail(normalizedEmail), attempt: count, lockedForMs });
    const body = { error: 'Incorrect email or password' };
    if (count >= 3) {
      await requireCaptchaKey();
      body.captcha = publicCaptcha(await makeCaptcha());
      body.requiresCaptcha = true;
    }
    if (lockedForMs) body.lockedFor = Math.ceil(lockedForMs / 1000);
    return res.status(401).json(body);
  }

  // Password correct. If 2FA is enabled, issue a short-lived challenge.
  if (user.totp?.enabled) {
    if (challenge) {
      if (!(await verifyChallenge(challenge, user.passwordHash, normalizedEmail))) {
        return res.status(401).json({ error: 'Sign-in session expired — start again', requiresChallenge: true });
      }
      const codeOk = totp && (await verifyTotp(user.totp.secret, totp));
      let backupOk = false;
      if (!codeOk && backupCode) {
        const normalized = normalizeBackupCode(backupCode);
        const hashed = await hashBackupCode(normalized);
        const idx = (user.totp.backupCodes || []).indexOf(hashed);
        if (idx !== -1) {
          user.totp.backupCodes.splice(idx, 1); // single use
          persistAuth();
          backupOk = true;
        }
      }
      if (!codeOk && !backupOk) {
        const { count } = loginGuardFail(guardKey);
        logAuthEvent('2fa-failed', { account: redactEmail(normalizedEmail), attempt: count });
        return res.status(401).json({ error: 'That code is not valid', requiresChallenge: true, challenge });
      }
      loginGuardSuccess(guardKey);
      const token = createSession(normalizedEmail);
      setSessionCookie(res, token);
      logAuthEvent('login-success-2fa', { account: redactEmail(normalizedEmail) });
      return res.json({ user: publicUser(user) });
    }
    logAuthEvent('login-challenge-issued', { account: redactEmail(normalizedEmail) });
    return res.status(401).json({
      requiresChallenge: true,
      challenge: await createChallenge(normalizedEmail, user.passwordHash),
    });
  }

  loginGuardSuccess(guardKey);
  const token = createSession(normalizedEmail);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

// ─── 2FA management (TOTP + backup codes) ────────────────────────────────────
function requireUser(req, res) {
  const user = userForToken(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  return user;
}

// Step 1: generate (but do not activate) a secret + otpauth URI
app.post('/api/auth/2fa/setup', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const secret = generateTotpSecret();
  user.totpPending = { secret, createdAt: Date.now() };
  persistAuth();
  res.json({ secret, otpauth: otpauthUri({ secret, email: user.email }) });
});

// Step 2: confirm a live code to activate, minting 10 single-use backup codes
app.post('/api/auth/2fa/enable', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const { totp: code } = req.body || {};
  const pending = user.totpPending;
  if (!pending || Date.now() - pending.createdAt > 10 * 60_000) {
    return res.status(400).json({ error: 'No pending 2FA setup — start again' });
  }
  if (!(await verifyTotp(pending.secret, code))) {
    return res.status(400).json({ error: 'That code is not valid — check your authenticator app' });
  }
  const plainCodes = generateBackupCodes(10);
  user.totp = {
    enabled: true,
    secret: pending.secret,
    backupCodes: await Promise.all(plainCodes.map((c) => hashBackupCode(c))),
  };
  delete user.totpPending;
  persistAuth();
  logAuthEvent('2fa-enabled', { account: redactEmail(user.email) });
  res.json({ enabled: true, backupCodes: plainCodes });
});

// Disable: requires the password again (protects a hijacked session)
app.post('/api/auth/2fa/disable', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const { password } = req.body || {};
  if (!user.totp?.enabled) return res.status(400).json({ error: '2FA is not enabled' });
  if (!verifyPassword(String(password || ''), user.passwordHash)) {
    logAuthEvent('2fa-disable-denied', { account: redactEmail(user.email) });
    return res.status(401).json({ error: 'Password is required to turn off 2FA' });
  }
  delete user.totp;
  delete user.totpPending;
  persistAuth();
  logAuthEvent('2fa-disabled', { account: redactEmail(user.email) });
  res.json({ enabled: false });
});

app.get('/api/auth/2fa/status', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ enabled: Boolean(user.totp?.enabled) });
});

app.get('/api/auth/me', (req, res) => {
  const user = userForToken(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { ...publicUser(user), twoFactorEnabled: Boolean(user.totp?.enabled) } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = tokenFromRequest(req);
  if (token && authStore.sessions[hashToken(token)]) {
    delete authStore.sessions[hashToken(token)];
    persistAuth();
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

// GDPR-style erasure: deletes the account, every session, and all their recipes.
app.delete('/api/auth/account', (req, res) => {
  const user = userForToken(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });

  const userEmail = user.email;
  authStore.users = authStore.users.filter((u) => u.email !== userEmail);
  for (const [storedHash, session] of Object.entries(authStore.sessions)) {
    if (session.email === userEmail) delete authStore.sessions[storedHash];
  }
  recipesByUser.delete(userEmail);
  persistAuth();
  clearSessionCookie(res);
  res.json({ success: true, deleted: userEmail });
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    recipes: savedRecipes.length,
    users: authStore.users.length,
    aiConfigured: Boolean(API_KEY),
    embeddingsConfigured: Boolean(EMBED_API_KEY),
  });
});

// ─── Server bootstrap ───────────────────────────────────────────────────────
export default app;

export function startServer(port = Number(process.env.PORT) || 3001) {
  // Loopback by default so a dev machine does not expose the API + keys to the LAN.
  const host = process.env.HOST || '127.0.0.1';
  return app.listen(port, host);
}

// Only auto-start when run directly (node server/index.js)
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startServer();
  server.on('error', (error) => {
    console.error('Server failed to start:', error.message);
    process.exit(1);
  });
  server.on('listening', () => {
    console.log(`ChefAI server running on http://localhost:${server.address().port}`);
  });
}
