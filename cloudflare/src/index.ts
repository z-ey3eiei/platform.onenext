export interface Env {
  ASSETS: Fetcher;
}

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,x-onenext-api-key,x-onenext-idempotency-key',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/v1/status') {
      return json({ ok: true, service: 'platform-onenext', runtime: 'cloudflare-workers' });
    }

    // Phase 2 mounts here: /v1/auth/*  /v1/db/query  /v1/storage/*
    if (url.pathname.startsWith('/v1/')) {
      return json({ error: { code: 'not_implemented', message: `${request.method} ${url.pathname} lands in Phase 2` } }, 501);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
