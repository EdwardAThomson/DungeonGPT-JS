// LOCAL-ONLY eval worker: POST { model, input } -> env.AI.run(model, input).
// Exists so the eval can pass parameters the production /api/ai/generate route does not
// forward (logprobs, reasoning controls) and read the raw response. No auth: dev only,
// never deploy (see wrangler.eval.toml).
export default {
  async fetch(req, env) {
    const origin = new URL(req.url).hostname;
    if (origin !== 'localhost' && origin !== '127.0.0.1') return new Response('local only', { status: 403 });
    if (req.method !== 'POST') return Response.json({ ok: true, ready: true });
    let body;
    try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }
    const t = Date.now();
    try {
      const out = await env.AI.run(body.model, body.input);
      return Response.json({ ok: true, ms: Date.now() - t, out });
    } catch (e) {
      return Response.json({ ok: false, ms: Date.now() - t, error: String(e?.message || e) });
    }
  },
};
