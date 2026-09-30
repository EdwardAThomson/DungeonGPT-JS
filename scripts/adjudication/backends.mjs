// Model backends for the adjudication eval scripts. Both return the same shape:
//   { ok, ms, out, servedBy?, costUsd?, error? }
// where `out` is an OpenAI-style completion ({ choices, usage }) as Workers AI and
// OpenRouter both return.
//
//  - workers-ai: through the LOCAL eval worker (scripts/adjudication/worker), which calls
//    env.AI.run() on the Cloudflare account. Counts against that account's Workers AI
//    allowance, which production shares.
//  - openrouter: direct HTTPS to OpenRouter, billed to the OpenRouter key. Every model is
//    provider-pinned (provider.only + allow_fallbacks:false) so runs are reproducible and
//    Chinese-origin models only reach US hosts; `servedBy` records who actually served it.
//
// OpenRouter key: read ONLY from process.env.OPENROUTER_API_KEY or an explicit --key-file
// (a line OPENROUTER_API_KEY=...). Never printed, logged, or written anywhere.

import fs from 'fs';

export function resolveOpenRouterKey(keyFile) {
  const env = process.env.OPENROUTER_API_KEY;
  if (env && env.trim()) return env.trim();
  if (!keyFile) return null;
  if (!fs.existsSync(keyFile)) throw new Error(`--key-file not found: ${keyFile}`);
  for (const line of fs.readFileSync(keyFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
  }
  throw new Error(`--key-file contains no line OPENROUTER_API_KEY=...`);
}

async function postJson(url, headers, body, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
    return { status: res.status, json, text, ms: Date.now() - t };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : String(e.message || e), ms: Date.now() - t };
  } finally {
    clearTimeout(timer);
  }
}

// model: { backend, id, logprobs, params, provider? }, messages, { maxTokens, temperature, json }
export async function callModel(model, messages, { maxTokens = 400, temperature = 0, json = true, timeoutMs = 45000, port = 8798, key } = {}) {
  if (model.backend === 'openrouter') {
    if (!key) return { ok: false, error: 'no OpenRouter key (set OPENROUTER_API_KEY or pass --key-file)' };
    const body = {
      model: model.id, messages, max_tokens: maxTokens, temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      ...(model.logprobs ? { logprobs: true, top_logprobs: 5 } : {}),
      ...(model.provider ? { provider: { only: model.provider, allow_fallbacks: false } } : {}),
      usage: { include: true },
      ...(model.params || {}),
    };
    const r = await postJson('https://openrouter.ai/api/v1/chat/completions',
      { authorization: `Bearer ${key}`, 'x-title': 'DungeonGPT adjudication eval' }, body, timeoutMs);
    if (r.error) return { ok: false, ms: r.ms, error: r.error };
    if (r.status !== 200 || !r.json?.choices) {
      const msg = r.json?.error?.message || r.text?.slice(0, 200) || `HTTP ${r.status}`;
      return { ok: false, ms: r.ms, error: `HTTP ${r.status}: ${msg}` };
    }
    return { ok: true, ms: r.ms, out: r.json, servedBy: r.json.provider ?? null, costUsd: r.json.usage?.cost ?? null };
  }
  // workers-ai via the local eval worker
  const input = {
    messages, max_tokens: maxTokens, temperature,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(model.logprobs ? { logprobs: true, top_logprobs: 5 } : {}),
    ...(model.params || {}),
  };
  const r = await postJson(`http://localhost:${port}/`, {}, { model: model.id, input }, timeoutMs);
  if (r.error) return { ok: false, ms: r.ms, error: r.error };
  if (!r.json?.ok) return { ok: false, ms: r.json?.ms ?? r.ms, error: r.json?.error || `HTTP ${r.status}` };
  return { ok: true, ms: r.json.ms, out: r.json.out, servedBy: 'workers-ai' };
}
