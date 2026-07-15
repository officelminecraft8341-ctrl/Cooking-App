import { buildAssistantReply, parseRecipeRequest } from './recipeAssistant';

describe('recipe assistant helpers', () => {
  it('extracts ingredients and dietary restrictions from a request', () => {
    const plan = parseRecipeRequest('I have eggs, spinach and cheese and need a vegetarian dinner under 20 minutes', 'Golden Tomato Pasta');

    expect(plan.ingredients).toEqual(expect.arrayContaining(['eggs', 'spinach', 'cheese']));
    expect(plan.dietaryRestrictions).toContain('vegetarian');
    expect(plan.timeHint).toBe('under 20 minutes');
  });

  it('builds a nutrition-aware reply for dietary requests', () => {
    const reply = buildAssistantReply('I need a gluten-free vegan dinner with chickpeas and broccoli', { title: 'Golden Tomato Pasta' });

    expect(reply).toContain('gluten-free');
    expect(reply).toContain('vegan');
    expect(reply).toContain('Nutrition');
    expect(reply).toMatch(/Calories|Protein|Carbs|Fat/i);
  });

  it('includes cooking tips in chat replies for practical guidance', () => {
    const reply = buildAssistantReply('Give me a quick vegan dinner with tomatoes', { title: 'Quick dinner' });

    expect(reply).toContain('Cooking tips');
    expect(reply).toContain('tomatoes');
  });
});
