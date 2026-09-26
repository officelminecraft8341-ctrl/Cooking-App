import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cosineSimilarity, buildRecipeText, tokenizeQuery, searchRecipes, clearEmbeddingCache } from './semanticSearch';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns 0 for mismatched lengths or empty inputs', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity(null, [1, 2])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('ignores magnitude — parallel vectors score 1', () => {
    expect(cosineSimilarity([1, 1], [10, 10])).toBeCloseTo(1, 6);
  });
});

describe('buildRecipeText', () => {
  it('includes title, ingredients, and instructions', () => {
    const text = buildRecipeText({
      title: 'Lemon Pasta',
      description: 'Bright and creamy.',
      ingredients: [{ amount: '200g', name: 'spaghetti' }, 'lemon'],
      instructions: ['Boil pasta.', 'Zest lemon.'],
      tag: 'Comfort',
      time: '20 min',
    });

    expect(text).toContain('Title: Lemon Pasta');
    expect(text).toContain('200g spaghetti');
    expect(text).toContain('Boil pasta.');
    expect(text).toContain('Tag: Comfort');
  });
});

describe('tokenizeQuery', () => {
  it('drops stop words and short tokens', () => {
    expect(tokenizeQuery('I want something creamy and herby')).toEqual(['creamy', 'herby']);
  });
});

describe('searchRecipes', () => {
  const recipes = [
    { title: 'Creamy Lemon Pasta', description: 'Creamy, herby, bright.', ingredients: ['pasta', 'cream', 'lemon'] },
    { title: 'Spicy Tacos', description: 'Hot and smoky.', ingredients: ['beef', 'chili'] },
  ];

  beforeEach(() => {
    clearEmbeddingCache();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('ranks semantically when the embed endpoint responds', async () => {
    const embeddingFor = (text) => {
      // Two naive "semantic" dimensions: creamy/herby vs spicy
      const creamy = /creamy|herby|pasta|lemon/i.test(text) ? 1 : 0;
      const spicy = /spicy|smoky|beef|chili/i.test(text) ? 1 : 0;
      return [creamy, spicy];
    };

    vi.stubGlobal('fetch', vi.fn((url, options) => {
      const body = JSON.parse(options.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ embedding: embeddingFor(body.input) }),
      });
    }));

    const results = await searchRecipes('something creamy and herby', recipes);

    expect(results[0].recipe.title).toBe('Creamy Lemon Pasta');
    expect(results[0].mode).toBe('semantic');
    expect(results[0].score).toBeGreaterThan(0.9);
    expect(results[1].mode).toBe('semantic');
  });

  it('falls back to keyword scoring when embeddings fail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'no key' }),
    })));

    const results = await searchRecipes('spicy tacos', recipes);

    expect(results[0].recipe.title).toBe('Spicy Tacos');
    expect(results[0].mode).toBe('keyword');
  });
});
