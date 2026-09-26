import { apiRequest } from './apiClient';

// ─── Vector math ─────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors. Returns 0 for invalid/zero vectors.
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Recipe text builder ─────────────────────────────────────────────────────

export function buildRecipeText(recipe) {
  const lines = [`Title: ${recipe.title || ''}`];
  if (recipe.description) lines.push(`Description: ${recipe.description}`);
  if (recipe.tag) lines.push(`Tag: ${recipe.tag}`);
  if (recipe.time) lines.push(`Time: ${recipe.time}`);
  if (recipe.difficulty) lines.push(`Difficulty: ${recipe.difficulty}`);
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    const ingredients = recipe.ingredients
      .map((i) => (typeof i === 'object' ? `${i.amount} ${i.name}` : String(i)))
      .join(', ');
    lines.push(`Ingredients: ${ingredients}`);
  }
  if (Array.isArray(recipe.instructions) && recipe.instructions.length > 0) {
    lines.push(`Instructions: ${recipe.instructions.join(' ')}`);
  }
  return lines.join('\n');
}

// ─── Embedding-backed search with keyword fallback ──────────────────────────

const embeddingCache = new Map();

export function clearEmbeddingCache() {
  embeddingCache.clear();
}

export async function fetchEmbedding(text) {
  const key = String(text);
  if (embeddingCache.has(key)) return embeddingCache.get(key);
  const data = await apiRequest('/embed', {
    method: 'POST',
    body: { input: key },
  });
  const embedding = data?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Invalid embedding response');
  }
  embeddingCache.set(key, embedding);
  return embedding;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'with', 'for', 'in', 'on', 'of', 'to',
  'something', 'i', 'me', 'my', 'want', 'need', 'make', 'recipe',
]);

export function tokenizeQuery(query) {
  return String(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function keywordScore(recipe, tokens) {
  if (tokens.length === 0) return 0;
  const haystack = buildRecipeText(recipe).toLowerCase();
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits / tokens.length;
}

/**
 * Rank saved recipes against a free-text query.
 * Tries embeddings first; falls back to keyword scoring when unavailable.
 */
export async function searchRecipes(query, recipes) {
  const tokens = tokenizeQuery(query);

  try {
    const [queryEmbedding, ...recipeEmbeddings] = await Promise.all([
      fetchEmbedding(query),
      ...recipes.map((recipe) => fetchEmbedding(buildRecipeText(recipe))),
    ]);

    return recipes
      .map((recipe, index) => ({
        recipe,
        score: cosineSimilarity(queryEmbedding, recipeEmbeddings[index]),
        mode: 'semantic',
      }))
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    return recipes
      .map((recipe) => ({
        recipe,
        score: keywordScore(recipe, tokens),
        mode: 'keyword',
      }))
      .sort((a, b) => b.score - a.score);
  }
}
