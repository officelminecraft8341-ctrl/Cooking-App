import { jsonResponse, preflightResponse, rateLimit, readJson, bucketFor, saveBucket, userForToken, httpError } from '../../lib/backend.js';

// Routes:
//   GET    /api/recipes            → caller's collection
//   POST   /api/recipes            → save a recipe
//   PUT    /api/recipes/:id/favorite
//   DELETE /api/recipes/:id
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  try {
    if (!env.CHEFAI_KV) return jsonResponse({ error: 'Storage is not configured (missing KV binding CHEFAI_KV)' }, { status: 500, request, env });

    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/api\/recipes\/?/, '').split('/').filter(Boolean); // ['', id, 'favorite'] shapes

    if (request.method === 'GET' && parts.length === 0) {
      const { bucket } = await bucketFor(request, env.CHEFAI_KV);
      return jsonResponse(bucket, { request, env });
    }

    if (request.method === 'POST' && parts.length === 0) {
      const body = await readJson(request);
      const recipe = body?.recipe || body;
      if (!recipe?.title) throw httpError(400, 'Recipe must have a title');
      const { bucket, email } = await bucketFor(request, env.CHEFAI_KV);
      if (!email) return jsonResponse({ error: 'Sign in to save recipes to the cloud' }, { status: 401, request, env });
      const exists = bucket.some((r) => r.title === recipe.title);
      if (exists) return jsonResponse({ message: 'Recipe already saved', recipe: bucket.find((r) => r.title === recipe.title) }, { request, env });
      const maxId = bucket.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
      const saved = { ...recipe, id: maxId + 1, savedAt: new Date().toISOString(), isFavorite: false };
      bucket.push(saved);
      await saveBucket(env.CHEFAI_KV, email, bucket);
      return jsonResponse({ recipe: saved }, { status: 201, request, env });
    }

    if ((request.method === 'PUT' || request.method === 'DELETE') && parts.length >= 1) {
      const id = parseInt(parts[0], 10);
      const { bucket, email } = await bucketFor(request, env.CHEFAI_KV);
      if (!email) return jsonResponse({ error: 'Sign in first' }, { status: 401, request, env });
      const index = bucket.findIndex((r) => r.id === id);
      if (index === -1) return jsonResponse({ error: 'Recipe not found' }, { status: 404, request, env });

      if (request.method === 'PUT' && parts[1] === 'favorite') {
        bucket[index] = { ...bucket[index], isFavorite: !bucket[index].isFavorite };
        await saveBucket(env.CHEFAI_KV, email, bucket);
        return jsonResponse({ recipe: bucket[index] }, { request, env });
      }
      if (request.method === 'DELETE') {
        const [removed] = bucket.splice(index, 1);
        await saveBucket(env.CHEFAI_KV, email, bucket);
        return jsonResponse({ success: true, recipe: removed }, { request, env });
      }
    }

    return jsonResponse({ error: 'Not found' }, { status: 404, request, env });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ error: status === 500 ? 'Recipe request failed' : error.message }, { status, request, env });
  }
}
