const ingredientKeywords = [
  'eggs', 'egg', 'spinach', 'cheese', 'chickpeas', 'chickpea', 'broccoli', 'salmon', 'pasta',
  'tomato', 'tomatoes', 'rice', 'mushroom', 'mushrooms', 'garlic', 'onion', 'onions', 'lemon',
  'dill', 'olive oil', 'beans', 'lentils', 'chicken', 'tofu', 'turkey', 'yogurt', 'milk', 'bread',
  'cream', 'basil', 'parmesan', 'herbs', 'curry', 'coconut', 'peas', 'carrot', 'carrots', 'zucchini'
];

const dietaryKeywords = {
  vegetarian: ['vegetarian', 'veg'],
  vegan: ['vegan'],
  'gluten-free': ['gluten-free', 'gluten free', 'gf'],
  keto: ['keto', 'low carb', 'low-carb'],
  'dairy-free': ['dairy-free', 'dairy free', 'lactose free', 'lactose-free'],
  'nut-free': ['nut-free', 'nut free'],
  pescatarian: ['pescatarian'],
  'high-protein': ['high protein', 'high-protein', 'protein rich'],
};

const cuisineKeywords = {
  italian: ['italian', 'pasta', 'risotto'],
  mexican: ['mexican', 'taco', 'tacos'],
  asian: ['asian', 'thai', 'sushi', 'ramen', 'sesame', 'soy'],
  mediterranean: ['mediterranean', 'greek', 'middle eastern'],
};

const equipmentKeywords = ['oven', 'pan', 'air fryer', 'slow cooker', 'sheet pan', 'blender', 'pot'];

function normalizeIngredients(text) {
  return ingredientKeywords.filter((ingredient) => text.includes(ingredient));
}

function inferTimeHint(text) {
  if (/under\s+(\d+)\s+minutes|in\s+(\d+)\s+minutes|(\d+)\s+min|quick/i.test(text)) {
    return text.match(/under\s+(\d+)\s+minutes|in\s+(\d+)\s+minutes|(\d+)\s+min/i)?.[0] || 'quick meal';
  }

  return 'flexible timing';
}

export function parseRecipeRequest(input, recipeName = '') {
  const text = `${input} ${recipeName}`.toLowerCase();
  const ingredients = normalizeIngredients(text);
  const dietaryRestrictions = Object.entries(dietaryKeywords)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([restriction]) => restriction);
  const timeHint = inferTimeHint(text);
  const cuisines = Object.entries(cuisineKeywords)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([cuisine]) => cuisine);
  const equipment = equipmentKeywords.filter((tool) => text.includes(tool));

  return {
    ingredients,
    dietaryRestrictions,
    timeHint,
    cuisines,
    equipment,
    recipeName,
  };
}

function buildRecipeTitle(parsed, input) {
  const base = parsed.cuisines[0] || 'creative';
  const ingredient = parsed.ingredients[0] || 'pantry';
  const prefix = parsed.dietaryRestrictions.includes('vegan') ? 'Vegan' : parsed.dietaryRestrictions.includes('vegetarian') ? 'Vegetarian' : 'Quick';
  return `${prefix} ${ingredient.charAt(0).toUpperCase() + ingredient.slice(1)} ${base.charAt(0).toUpperCase() + base.slice(1)} Bowl`;
}

function buildIngredients(parsed) {
  const baseIngredients = parsed.ingredients.length > 0 ? parsed.ingredients : ['olive oil', 'garlic', 'herbs'];
  const ingredientList = baseIngredients.map((item) => `${item}`);
  const pantryAdditions = parsed.dietaryRestrictions.includes('vegan') ? ['coconut milk'] : ['butter'];
  return [...ingredientList, ...pantryAdditions].slice(0, 7);
}

function buildSteps(parsed, input) {
  const steps = [
    'Sauté aromatics in a pan until fragrant.',
    'Add your primary ingredients and cook until tender.',
    'Season with herbs, spice, and a splash of acid or broth.',
    'Finish with a texture boost such as cheese, yogurt, or toasted nuts.',
  ];

  if (parsed.timeHint.includes('15') || parsed.timeHint.includes('20')) {
    steps[0] = 'Start with a hot pan and cook aromatics quickly.';
  }

  if (parsed.ingredients.includes('tomatoes')) {
    steps[1] = 'Let the tomatoes soften and concentrate their flavor before adding the rest.';
  }

  return steps;
}

function pickNutrition(parsed) {
  const baseCalories = parsed.dietaryRestrictions.includes('vegan') ? 420 : 470;
  const protein = parsed.dietaryRestrictions.includes('high-protein') || parsed.ingredients.includes('eggs') || parsed.ingredients.includes('chickpeas') ? 24 : 16;
  const carbs = parsed.dietaryRestrictions.includes('keto') ? 18 : 38;
  const fat = parsed.dietaryRestrictions.includes('vegan') ? 16 : 20;
  return {
    calories: `${baseCalories}`,
    protein: `${protein}g`,
    carbs: `${carbs}g`,
    fat: `${fat}g`,
    fiber: '7g',
    sodium: '480mg',
  };
}

function buildSubstitutions(parsed) {
  const substitutions = [];
  if (parsed.ingredients.includes('cheese')) substitutions.push('Cheese → dairy-free cheese or toasted chickpeas');
  if (parsed.ingredients.includes('milk') || parsed.ingredients.includes('cream')) substitutions.push('Milk/cream → oat milk or coconut milk');
  if (parsed.ingredients.includes('pasta')) substitutions.push('Pasta → gluten-free pasta or rice noodles');
  if (parsed.ingredients.includes('eggs')) substitutions.push('Eggs → tofu scramble or chickpea flour');
  if (parsed.ingredients.includes('tomatoes')) substitutions.push('Tomatoes → roasted red peppers or canned tomatoes');
  if (substitutions.length === 0) substitutions.push('Butter → olive oil or avocado');
  return substitutions;
}

function buildTips(parsed) {
  const tips = ['Cooking tips: Keep your pan hot for better browning.'];

  if (parsed.ingredients.includes('tomatoes')) {
    tips.push('Let the tomatoes cook down until glossy for a richer sauce.');
  }

  if (parsed.dietaryRestrictions.includes('vegan')) {
    tips.push('Use a splash of soy sauce or lemon to brighten the finish.');
  }

  return tips.join(' ');
}

export function buildAssistantReply(input, recipe) {
  const parsed = parseRecipeRequest(input, recipe?.title || '');
  const title = buildRecipeTitle(parsed, input);
  const ingredients = buildIngredients(parsed);
  const steps = buildSteps(parsed, input);
  const nutrition = pickNutrition(parsed);
  const substitutions = buildSubstitutions(parsed);
  const diet = parsed.dietaryRestrictions.length > 0 ? parsed.dietaryRestrictions.join(', ') : 'balanced';
  const tips = buildTips(parsed);

  return [
    `Recipe title: ${title}`,
    `Quick idea: A ${parsed.timeHint === 'flexible timing' ? 'balanced' : parsed.timeHint} recipe built around your request and ${diet}.`,
    `Ingredients: ${ingredients.join(', ')}.`,
    `Instructions: ${steps.join(' ')}`,
    `Nutrition (approx. per serving): ${nutrition.calories} kcal • Protein ${nutrition.protein} • Carbs ${nutrition.carbs} • Fat ${nutrition.fat} • Fiber ${nutrition.fiber} • Sodium ${nutrition.sodium}.`,
    `Substitutions: ${substitutions.join('; ')}.`,
    `Dietary fit: ${diet}.`,
    tips,
  ].join('\n');
}
