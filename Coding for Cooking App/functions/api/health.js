import { jsonResponse } from '../lib/backend.js';

export async function onRequest(context) {
  const { env } = context;
  return jsonResponse(
    {
      status: 'ok',
      storageConfigured: Boolean(env?.CHEFAI_KV),
      aiConfigured: Boolean(env?.OPENAI_API_KEY || env?.AI_API_KEY),
      embeddingsConfigured: Boolean(env?.EMBED_API_KEY || env?.OPENAI_API_KEY || env?.AI_API_KEY),
    },
    { status: 200 },
  );
}
