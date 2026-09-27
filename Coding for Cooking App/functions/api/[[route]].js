import { jsonResponse, preflightResponse, rateLimit, readJson, callAI, httpError, parseDataImages, visionContent, callEmbeddings } from '../lib/backend.js';

// AI routes handled here (all rate-limited, key stays server-side):
//   POST /api/vision/pantry      → photo → ingredients
//   POST /api/vision/dish        → photo → dish
//   POST /api/chat               → chef conversation
//   POST /api/embed              → semantic search embedding
// (/api/recipes/ideas and /api/recipes/generate are dedicated static functions;
//  /api/auth/* and /api/recipes CRUD have their own routers.)

const AI_MAX = { windowMs: 60_000, max: 20 };

function stripFences(text) {
  return String(text).trim().replace(/^```[a-z]*s*/i, '').replace(/```s*$/i, '').trim();
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405, request, env });

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/api\/?/, '').replace(/\/$/, ''); // e.g. "recipes/ideas"

  try {
    if (!rateLimit(request, AI_MAX)) return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, { status: 429, request, env });

    // ── POST /api/vision/pantry ──────────────────────────────────────────
    if (route === 'vision/pantry') {
      const { images: rawImages } = await readJson(request);
      const images = parseDataImages(rawImages);
      if (images.length === 0) throw httpError(400, 'At least one image is required');
      const content = visionContent('You are a grocery identification expert. List every distinct edible ingredient you can confidently identify in the photo(s). Respond with ONLY JSON: {"ingredients":["…"]}. Simple names a person would type. If no food is visible, return {"ingredients":[]}.', images);
      const reply = await callAI(env, [{ role: 'user', content }], env.VISION_MODEL);
      const match = stripFences(reply).match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : stripFences(reply));
      const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.filter((i) => typeof i === 'string' && i.trim()).map((i) => i.trim()).slice(0, 40) : [];
      return jsonResponse({ ingredients }, { request, env });
    }

    // ── POST /api/vision/dish ────────────────────────────────────────────
    if (route === 'vision/dish') {
      const { images: rawImages } = await readJson(request);
      const images = parseDataImages(rawImages);
      if (images.length === 0) throw httpError(400, 'At least one image is required');
      const content = visionContent('Identify the dish in this photo. Respond with ONLY JSON: {"dish":"specific dish name","description":"one sentence","keyIngredients":["3-8 likely ingredients"]}. If it is not food, return {"dish":null}.', images);
      const reply = await callAI(env, [{ role: 'user', content }], env.VISION_MODEL);
      const match = stripFences(reply).match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : stripFences(reply));
      return jsonResponse({ dish: parsed.dish || null, description: parsed.description || '', keyIngredients: Array.isArray(parsed.keyIngredients) ? parsed.keyIngredients : [] }, { request, env });
    }

    // ── POST /api/chat ───────────────────────────────────────────────────
    if (route === 'chat') {
      const { message, history = [], recipe, images: rawImages, savedRecipes = [] } = await readJson(request);
      if (!message?.trim()) throw httpError(400, 'Message is required');
      const images = parseDataImages(rawImages || []);

      const recipeContext = recipe
        ? `The user is currently looking at this recipe:\nTitle: ${recipe.title}\nIngredients: ${Array.isArray(recipe.ingredients) ? recipe.ingredients.map((i) => (typeof i === 'object' ? `${i.amount} ${i.name}` : i)).join(', ') : recipe.ingredients || 'N/A'}\nInstructions: ${Array.isArray(recipe.instructions) ? recipe.instructions.join(' | ') : recipe.instructions || 'N/A'}`
        : 'No specific recipe is currently active.';
      const savedContext = Array.isArray(savedRecipes) && savedRecipes.length > 0
        ? `\n\nThe user's saved recipes (they may ask to switch to any of these by name):\n${savedRecipes.slice(0, 20).map((r) => `- ${r.title}`).join('\n')}\nIf the user asks to switch to one of these, end your reply with a line exactly: [SWITCH_RECIPE: <exact title>]`
        : '';

      const messages = [
        { role: 'system', content: `You are ChefAI, a warm and knowledgeable cooking assistant. Help with recipe ideas, techniques, substitutions, dietary adjustments, scaling, nutrition, timing.\n\nContext:\n${recipeContext}${savedContext}\n\nBe concise and friendly. Never make up medical or allergy advice.` },
        ...history.slice(-10),
        { role: 'user', content: images.length > 0 ? visionContent(message, images) : message },
      ];
      const reply = await callAI(env, messages, images.length > 0 ? env.VISION_MODEL : undefined);
      return jsonResponse({ reply }, { request, env });
    }

    // ── POST /api/embed ──────────────────────────────────────────────────
    if (route === 'embed') {
      const { input } = await readJson(request, { maxBytes: 20_000 });
      const text = typeof input === 'string' ? input.trim() : '';
      if (!text) throw httpError(400, 'input text is required');
      if (text.length > 4000) throw httpError(400, 'input text is too long (max 4000 characters)');
      const embedding = await callEmbeddings(env, text);
      return jsonResponse({ embedding }, { request, env });
    }

    return jsonResponse({ error: 'Not found' }, { status: 404, request, env });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(`${route} failed:`, error.message);
    return jsonResponse({ error: status === 500 ? 'AI request failed. Please try again.' : error.message }, { status, request, env });
  }
}
