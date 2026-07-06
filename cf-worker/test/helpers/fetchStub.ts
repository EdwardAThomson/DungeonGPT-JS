import { vi } from "vitest";

// Outbound-fetch stub. @cloudflare/vitest-pool-workers 0.18 (the vitest 4 line)
// no longer ships the undici `fetchMock` from "cloudflare:test", so we stub the
// global fetch instead: test code and worker source run in the same isolate, so
// this intercepts the middleware's JWKS fetch and the OpenRouter calls alike.
// Any request with no matching handler throws, which both fails the test loudly
// and guarantees nothing ever escapes to the real network.

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Parsed JSON body when the request had one, else undefined. */
  json?: unknown;
}

type Responder = (
  req: RecordedRequest
) =>
  | Response
  | object
  | Promise<Response | object>;

interface Route {
  match: (url: string, method: string) => boolean;
  respond: Responder;
  once: boolean;
  used: boolean;
}

export class FetchStub {
  readonly requests: RecordedRequest[] = [];
  private routes: Route[] = [];

  /** Replace globalThis.fetch. Call `restore()` (or vi.unstubAllGlobals) after. */
  install(): this {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      this.dispatch(input, init)
    );
    return this;
  }

  restore(): void {
    vi.unstubAllGlobals();
  }

  /**
   * Register a handler for URLs starting with `urlPrefix`. Handlers are tried in
   * registration order; `once: true` handlers are consumed on first match (use a
   * sequence of them to script a fallback chain). A plain-object return becomes
   * a 200 JSON response; return a `Response` for full control.
   */
  on(
    urlPrefix: string,
    respond: Responder,
    opts: { once?: boolean; method?: string } = {}
  ): this {
    this.routes.push({
      match: (url, method) =>
        url.startsWith(urlPrefix) &&
        (opts.method === undefined || opts.method === method),
      respond,
      once: opts.once ?? false,
      used: false,
    });
    return this;
  }

  private async dispatch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const request = new Request(input, init);
    const recorded: RecordedRequest = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
    };
    const bodyText = request.body ? await request.text() : "";
    if (bodyText) {
      try {
        recorded.json = JSON.parse(bodyText);
      } catch {
        // non-JSON body: leave json undefined
      }
    }
    this.requests.push(recorded);

    for (const route of this.routes) {
      if (route.used && route.once) continue;
      if (!route.match(recorded.url, recorded.method)) continue;
      route.used = true;
      const result = await route.respond(recorded);
      return result instanceof Response ? result : Response.json(result);
    }

    throw new Error(
      `FetchStub: unexpected outbound fetch ${recorded.method} ${recorded.url} ` +
        `(no handler registered; tests must never hit the network)`
    );
  }
}
