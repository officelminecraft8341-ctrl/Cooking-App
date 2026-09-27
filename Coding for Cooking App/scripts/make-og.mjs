// Generates public/og-image.png (1200x630) — run once; the PNG is committed.
// Standalone HTML -> no build step needed to regenerate.
import fs from 'node:fs';
import path from 'node:path';
const html = `<!doctype html><html><body style="margin:0"><div style="width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#7c2d12 100%);font-family:system-ui,sans-serif;">
<div style="display:flex;align-items:center;gap:24px;">
<div style="width:96px;height:96px;border-radius:28px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/></svg></div>
<div><p style="margin:0;font-size:64px;font-weight:800;color:#fff;letter-spacing:-2px;">ChefAI</p>
<p style="margin:4px 0 0;font-size:28px;color:#fdba74;font-weight:500;">Your AI cooking assistant</p></div></div>
<p style="margin-top:40px;font-size:24px;color:#cbd5e1;max-width:760px;text-align:center;line-height:1.5;">Turn what's in your kitchen into dinner — recipes, chef chat, photo-to-recipe, and semantic search. Free.</p>
</div></body></html>`;
fs.writeFileSync(path.join('scripts', 'og-source.html'), html);
console.log('scripts/og-source.html written — open it in a browser and screenshot 1200x630 to public/og-image.png');
