export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
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
      modifyRequest = null,
    } = body || {};

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
      const { action, target, message, existingRecipe } = modifyRequest;
      systemPrompt += '\n\nYou are modifying an existing recipe. Make the requested change while preserving the core of the recipe as much as possible, then recalculate nutrition and instructions accordingly.';
      userContent = `Here is the current recipe:\n${JSON.stringify(existingRecipe, null, 2)}\n\nModification requested: `;

      if (action === 'remove') {
        userContent += `Remove the ingredient "${target}" entirely. Adjust the recipe so it still works without it.`;
      } else if (action === 'substitute') {
        userContent += `Substitute the ingredient "${target}" with a suitable alternative. Adjust instructions and nutrition.`;
      } else if (action === 'feedback') {
        userContent += `The user provided this feedback: "${message}". Please adjust the recipe accordingly.`;
      }
    } else {
      const ingredientsList = ingredients.length > 0 ? ingredients.join(', ') : prompt || 'whatever you think is best';
      const cuisineList = cuisines.length > 0 ? cuisines.join(' and ') + ' fusion' : '';

      if (strictMode) {
        systemPrompt += '\n\nCRITICAL STRICT MODE: You are FORBIDDEN from using any ingredients that are not explicitly listed by the user, except for absolute basics like salt, pepper, cooking oil, and water.';
      }

      if (accessibility) {
        systemPrompt += `\n\nCRITICAL ACCESSIBILITY NEED: The user has indicated this disability/accessibility need: "${accessibility}".\nYou MUST heavily adapt the instructions, cooking methods, and required tools to accommodate this limitation safely and easily. Do not suggest techniques that violate this need.`;
      }

      userContent = [
        'Create an exceptional recipe with these constraints:',
        ingredientsList ? `- Ingredients available: ${ingredientsList}` : '',
        cuisineList ? `- Cuisine: ${cuisineList}` : '',
        diet ? `- Dietary requirement: ${diet}` : '',
        time ? `- Target cook time: ${time}` : '',
        difficulty !== 'Any' ? `- Difficulty level: ${difficulty}` : '',
        servings ? `- Servings: ${servings}` : '',
        pantryItems.length > 0 ? `- The user has these pantry items, prioritize using them: ${pantryItems.join(', ')}` : '',
      ].filter(Boolean).join('\n');
    }

    const apiKey = env.OPENAI_API_KEY || env.AI_API_KEY || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI API key is not configured.' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const aiUrl = env.AI_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const model = env.AI_MODEL || 'cohere/north-mini-code:free';
    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }] }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || 'AI request failed' }), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const cleaned = content.trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();

    let recipe;
    try {
      recipe = JSON.parse(cleaned);
    } catch {
      recipe = { title: 'Recipe generated', description: content };
    }

    return new Response(JSON.stringify({ recipe }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to generate recipe' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
