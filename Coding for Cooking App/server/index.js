import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ─── Config ────────────────────────────────────────────────────────────────
const API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
const AI_URL = process.env.AI_URL || 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.AI_MODEL || 'cohere/north-mini-code:free';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  next();
});

// ─── In-memory recipe store (Phase 2 will replace with Prisma/SQLite) ──────
let savedRecipes = [];
let nextId = 1;

// ─── Helpers ────────────────────────────────────────────────────────────────
async function callAI(messages) {
  if (!API_KEY) {
    throw new Error('Missing AI API key. Set OPENAI_API_KEY or AI_API_KEY in your environment.');
  }

  const response = await fetch(AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}

// ─── POST /api/recipes/generate ─────────────────────────────────────────────
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
  ]
}

Rules:
- DO NOT write lazy or generic recipes. Use specific techniques, accurate temperatures, and proper culinary terms.
- Nutrition values MUST be calculated accurately based on the exact ingredients and amounts provided.
- Instructions must be specific and numbered clearly. Include at least 5 steps.
- Include at least 5 ingredients, up to 15.
- Substitutions should address dietary swaps or common pantry alternatives.`;

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
  }

  try {
    const content = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);

    let cleaned = content.trim();
    // Strip markdown fences robustly
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    }
    
    const recipe = JSON.parse(cleaned);
    return res.json({ recipe });
  } catch (error) {
    console.error('Recipe generation failed:', error);
    return res.status(500).json({ error: 'Failed to generate recipe. Please try again.', details: error.message });
  }
});

// ─── POST /api/chat ──────────────────────────────────────────────────────────
// Takes: { message, history, recipe }
// history = [{ role: 'user'|'assistant', content: string }]
// recipe = the current active recipe object (optional)
app.post('/api/chat', async (req, res) => {
  const { message, history = [], recipe } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
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
Never make up specific medical or allergy advice — always suggest consulting a professional for serious dietary needs.`;

  // Build conversation history (limit to last 10 messages to keep tokens manageable)
  const recentHistory = history.slice(-10);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: message },
  ];

  try {
    const reply = await callAI(messages);
    return res.json({ reply });
  } catch (error) {
    console.error('Chat failed:', error.message);
    return res.status(500).json({ error: 'Chat is temporarily unavailable. Please try again.' });
  }
});

// ─── GET /api/recipes ────────────────────────────────────────────────────────
app.get('/api/recipes', (req, res) => {
  res.json(savedRecipes);
});

// ─── POST /api/recipes ───────────────────────────────────────────────────────
app.post('/api/recipes', (req, res) => {
  const recipe = req.body;
  if (!recipe?.title) {
    return res.status(400).json({ error: 'Recipe must have a title' });
  }

  // Avoid exact duplicates
  const exists = savedRecipes.some((r) => r.title === recipe.title);
  if (exists) {
    return res.json({ message: 'Recipe already saved', recipe: savedRecipes.find((r) => r.title === recipe.title) });
  }

  const saved = { ...recipe, id: nextId++, savedAt: new Date().toISOString(), isFavorite: false };
  savedRecipes.push(saved);
  return res.status(201).json({ recipe: saved });
});

// ─── PUT /api/recipes/:id/favorite ──────────────────────────────────────────
app.put('/api/recipes/:id/favorite', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const recipe = savedRecipes.find((r) => r.id === id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  recipe.isFavorite = !recipe.isFavorite;
  res.json({ recipe });
});

// ─── DELETE /api/recipes/:id ─────────────────────────────────────────────────
app.delete('/api/recipes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = savedRecipes.findIndex((r) => r.id === id);
  if (index === -1) return res.status(404).json({ error: 'Recipe not found' });
  savedRecipes.splice(index, 1);
  res.json({ success: true });
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', recipes: savedRecipes.length, aiConfigured: Boolean(API_KEY) });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`ChefAI server running on http://localhost:${port}`);
});
