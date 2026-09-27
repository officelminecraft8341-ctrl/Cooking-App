// ─── AI recipe handlers shared by the static Pages Function files ────────────
// Lives here so both functions/api/recipes/ideas.js and
// functions/api/recipes/generate.js (and the catch-all router) run one copy.
import { jsonResponse, readJson, callAI, httpError, parseDataImages, visionContent } from './backend.js';

function stripFences(text) {
  return String(text).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
}

// Meal-type focus lines for ideas + generation (Generate view mode).
const MEAL_TYPE_PROMPTS = {
  breakfast: 'All concepts must be BREAKFAST dishes — morning-appropriate, egg/pancake/granola/savory-breakfast territory.',
  lunch: 'All concepts must be LUNCH dishes — satisfying midday meals, lighter than dinner, quick enough for a lunch break.',
  snack: 'All concepts must be SNACKS or small bites — finger foods, dips, toast, quick bites under 20 minutes.',
  dinner: 'All concepts must be DINNER dishes — hearty, main-course evening meals.',
  extra: 'All concepts must be DESSERTS, drinks, or fun extras — sweet treats, beverages, or experimental bites.',
};

export async function handleIdeas({ request, env }) {
  const { prompt = '', ingredients = [], cuisines = [], diet = '', time = '', servings = 2, mealType = '' } = await readJson(request);
  const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
  const safeCuisines = Array.isArray(cuisines) ? cuisines : [];
  const ingredientsList = safeIngredients.length > 0 ? safeIngredients.join(', ') : prompt || 'whatever you think is best';
  const mealLine = MEAL_TYPE_PROMPTS[mealType] || '';
  const content = await callAI(env, [
    { role: 'system', content: `You are ChefAI, a creative culinary director. Propose exactly 3 distinct dish concepts: one SIMPLE (beginner-friendly), one INTERMEDIATE, one AMBITIOUS.${mealLine ? ` MEAL TYPE FOCUS: ${mealLine}` : ''} Respond with ONLY valid JSON, no fences:\n{"ideas":[{"id":"simple","title":"…","description":"…","complexity":"Simple","time":"25 min","keyTwist":"…"},{"id":"intermediate",…},{"id":"ambitious",…}]}` },
    { role: 'user', content: [`Propose 3 dish concepts with these constraints:`, `- Ingredients available: ${ingredientsList}`, safeCuisines.length ? `- Cuisine: ${safeCuisines.join(' and ')}` : '', diet ? `- Dietary requirement: ${diet}` : '', time ? `- Target cook time: ${time}` : '', `- Servings: ${servings}`].filter(Boolean).join('\n') },
  ]);
  const cleaned = stripFences(content);
  const match = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : cleaned);
  return jsonResponse({ ideas: parsed.ideas || [] }, { request, env });
}

export async function handleGenerate({ request, env }) {
  const body = await readJson(request);
  const { prompt = '', ingredients = [], cuisines = [], diet = '', time = '', servings = 2, pantryItems = [], difficulty = 'Any', strictMode = false, accessibility = '', modifyRequest = null, imageIngredients = null, idea = null, mealType = '' } = body || {};

  let systemPrompt = `You are ChefAI, an elite culinary expert and nutritionist. Generate a complete, realistic, detailed recipe. Respond with ONLY valid JSON (no markdown fences) with exactly this structure:\n{"title":"…","description":"…","time":"X min","difficulty":"Easy|Medium|Hard","servings":2,"tag":"…","cuisine":"…","diet":["…"],"ingredients":[{"name":"…","amount":"…"}],"instructions":["Step 1: …"],"nutrition":{"calories":0,"protein":"0g","carbs":"0g","fat":"0g","fiber":"0g","sodium":"0mg"},"tips":"…","substitutions":["…"],"tutorials":{"videoQuery":"short search phrase for a video tutorial","articleQuery":"short search phrase for an in-depth article"}}`;
  let userContent = '';

  if (modifyRequest) {
    const { action, target, message, existingRecipe } = modifyRequest;
    systemPrompt += '\n\nYou are modifying an existing recipe. Make the requested change, keep the core intact, recalculate nutrition.';
    userContent = `Current recipe:\n${JSON.stringify(existingRecipe)}\n\nModification: ${action === 'remove' ? `Remove "${target}" entirely and adjust.` : action === 'substitute' ? `Substitute "${target}" with a suitable alternative.` : `Feedback: "${message}"`}`;
  } else {
    if (idea) {
      systemPrompt += `\n\nDevelop EXACTLY this dish concept at the stated complexity: "${idea.ideaTitle}" (${idea.ideaComplexity}). What makes it special: ${idea.ideaTwist || 'as proposed'}`;
    }
    const genMealLine = MEAL_TYPE_PROMPTS[mealType];
    if (genMealLine) systemPrompt += `\n\nMEAL TYPE FOCUS: ${genMealLine}`;
    if (strictMode) systemPrompt += '\n\nCRITICAL STRICT MODE: You are FORBIDDEN from using any ingredients not explicitly listed, except salt, pepper, cooking oil, and water.';
    if (accessibility) systemPrompt += `\n\nCRITICAL ACCESSIBILITY NEED: "${accessibility}". Heavily adapt instructions, methods, and tools to accommodate this safely. Do not suggest techniques that violate it.`;
    const genIngredients = Array.isArray(ingredients) ? ingredients : [];
    const genCuisinesSafe = Array.isArray(cuisines) ? cuisines : [];
    const genPantry = Array.isArray(pantryItems) ? pantryItems : [];
    userContent = [`Create an exceptional recipe with these constraints:`, genIngredients.length ? `- Ingredients available: ${genIngredients.join(', ')}` : '', prompt ? `- Request: ${prompt}` : '', genCuisinesSafe.length ? `- Cuisine: ${genCuisinesSafe.join(' and ')} fusion` : '', diet ? `- Dietary requirement: ${diet}` : '', time ? `- Target cook time: ${time}` : '', difficulty !== 'Any' ? `- Difficulty level: ${difficulty}` : '', servings ? `- Servings: ${servings}` : '', genPantry.length ? `- Pantry items to prioritize: ${genPantry.join(', ')}` : ''].filter(Boolean).join('\n');
  }

  const images = imageIngredients?.images ? parseDataImages(imageIngredients.images) : [];
  if (images.length > 0) {
    userContent += '\n\nA photo is attached. FIRST identify the dish in the photo, THEN create the full recipe for it, honoring all constraints above. If the photo shows no food, respond with {"error":"No food detected in the photo"} and nothing else.';
  }

  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: images.length > 0 ? visionContent(userContent, images) : userContent }];
  // Photos need the vision model; text-only uses the default chat model.
  const reply = await callAI(env, messages, images.length > 0 ? env.VISION_MODEL : undefined);
  const cleaned = stripFences(reply);
  const match = cleaned.match(/\{[\s\S]*\}/);
  let recipe;
  try { recipe = JSON.parse(match ? match[0] : cleaned); } catch { throw httpError(502, 'The AI response could not be parsed. Please try again.'); }
  if (recipe.error) throw httpError(422, recipe.error);

  const title = recipe.title || 'Recipe';
  const videoQuery = recipe.tutorials?.videoQuery || `how to make ${title}`;
  const articleQuery = recipe.tutorials?.articleQuery || `${title} recipe technique guide`;
  recipe.tutorials = {
    videoQuery, articleQuery,
    videoUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(videoQuery)}`,
    articleUrl: `https://www.google.com/search?q=${encodeURIComponent(articleQuery)}`,
  };
  return jsonResponse({ recipe }, { request, env });
}
