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
    const { message, history = [], recipe } = body || {};

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const recipeContext = recipe
      ? `The user is currently looking at this recipe:\nTitle: ${recipe.title}\nIngredients: ${Array.isArray(recipe.ingredients) ? recipe.ingredients.map((i) => (typeof i === 'object' ? `${i.amount} ${i.name}` : i)).join(', ') : recipe.ingredients || 'N/A'}\nInstructions: ${Array.isArray(recipe.instructions) ? recipe.instructions.join(' | ') : recipe.instructions || 'N/A'}\nDiet tags: ${Array.isArray(recipe.diet) ? recipe.diet.join(', ') : recipe.diet || 'N/A'}\nNutrition: ${recipe.nutrition ? JSON.stringify(recipe.nutrition) : 'N/A'}`
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

    const recentHistory = history.slice(-10);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ];

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
      body: JSON.stringify({ model, messages }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || 'AI request failed' }), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }

    const reply = data?.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Chat request failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
