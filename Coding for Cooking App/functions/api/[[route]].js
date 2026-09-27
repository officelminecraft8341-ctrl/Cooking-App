import { jsonResponse, preflightResponse, rateLimit, readJson, callAI, httpError, parseDataImages, visionContent, callEmbeddings } from '../../lib/backend.js';

// AI routes (all rate-limited, key stays server-side):
//   POST /api/recipes/ideas      → 3 dish concepts
//   POST /api/recipes/generate   → full recipe JSON (optionally from a photo)
//   POST /api/vision/pantry      → photo → ingredients
//   POST /api/vision/dish        → photo → dish
//   POST /api/chat               → chef conversation
//   POST /api/embed              → semantic search embedding

const AI_MAX = { windowMs: 60_000, max: 20 };

function stripFences(text) {
  return String(text).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405, request, env });

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/api\/?/, '').replace(/\/$/, ''); // e.g. "recipes/ideas"

  try {
    if (!rateLimit(request, AI_MAX)) return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, { status: 429, request, env });

    // ── POST /api/recipes/ideas ──────────────────────────────────────────
    if (route === 'recipes/ideas') {
      const { prompt = '', ingredients = [], cuisines = [], diet = '', time = '', servings = 2 } = await readJson(request);
      const ingredientsList = ingredients.length > 0 ? ingredients.join(', ') : prompt || 'whatever you think is best';
      const content = await callAI(env, [
        { role: 'system', content: `You are ChefAI, a creative culinary director. Propose exactly 3 distinct dish concepts: one SIMPLE (beginner-friendly), one INTERMEDIATE, one AMBITIOUS. Respond with ONLY valid JSON, no fences:\n{"ideas":[{"id":"simple","title":"…","description":"…","complexity":"Simple","time":"25 min","keyTwist":"…"},{"id":"intermediate",…},{"id":"ambitious",…}]}` },
        { role: 'user', content: [`Propose 3 dish concepts with these constraints:`, `- Ingredients available: ${ingredientsList}`, cuisines.length ? `- Cuisine: ${cuisines.join(' and ')}` : '', diet ? `- Dietary requirement: ${diet}` : '', time ? `- Target cook time: ${time}` : '', `- Servings: ${servings}`].filter(Boolean).join('\n') },
      ]);
      const match = stripFences(content).match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : stripFences(content));
      return jsonResponse({ ideas: parsed.ideas || [] }, { request, env });
    }

    // ── POST /api/recipes/generate ───────────────────────────────────────
    if (route === 'recipes/generate') {
      const body = await readJson(request);
      const { prompt = '', ingredients = [], cuisines = [], diet = '', time = '', servings = 2, pantryItems = [], difficulty = 'Any', strictMode = false, accessibility = '', modifyRequest = null, imageIngredients = null, idea = null } = body || {};

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
        if (strictMode) systemPrompt += '\n\nCRITICAL STRICT MODE: You are FORBIDDEN from using any ingredients not explicitly listed, except salt, pepper, cooking oil, and water.';
        if (accessibility) systemPrompt += `\n\nCRITICAL ACCESSIBILITY NEED: "${accessibility}". Heavily adapt instructions, methods, and tools to accommodate this safely. Do not suggest techniques that violate it.`;
        userContent = [`Create an exceptional recipe with these constraints:`, ingredients.length ? `- Ingredients available: ${ingredients.join(', ')}` : '', prompt ? `- Request: ${prompt}` : '', cuisines.length ? `- Cuisine: ${cuisines.join(' and ')} fusion` : '', diet ? `- Dietary requirement: ${diet}` : '', time ? `- Target cook time: ${time}` : '', difficulty !== 'Any' ? `- Difficulty level: ${difficulty}` : '', servings ? `- Servings: ${servings}` : '', pantryItems.length ? `- Pantry items to prioritize: ${pantryItems.join(', ')}` : ''].filter(Boolean).join('\n');
      }

      const images = imageIngredients?.images ? parseDataImages(imageIngredients.images) : [];
      if (images.length > 0) {
        userContent += '\n\nA photo is attached. FIRST identify the dish in the photo, THEN create the full recipe for it, honoring all constraints above. If the photo shows no food, respond with {"error":"No food detected in the photo"} and nothing else.';
      }

      const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: images.length > 0 ? visionContent(userContent, images) : userContent }];
      const reply = await callAI(env, messages, images.length > 0 ? undefined : undefined);
      const cleaned = stripFences(reply);
      const match = cleaned.match(/\{[\s\S]*\}/);
      let recipe;
      try { recipe = JSON.parse(match ? match[0] : cleaned); } catch { throw httpError(502, 'The AI response could not be parsed. Please try again.'); }
      if (recipe.error) throw httpError(422, recipe.error);

      // Deterministic tutorial links from AI-suggested search phrases
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
