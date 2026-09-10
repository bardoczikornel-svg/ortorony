// Őrtorony Worker — statikus oldal + /api/company végpont
// A statikus fájlokat (index.html, data/…) az ASSETS binding szolgálja ki; a Worker csak az /api/* utakra fut.
// Env: GH_TOKEN (Secret, dashboardon), GH_REPO és GH_BRANCH (a wrangler.jsonc vars blokkjában)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/company') {
      if (request.method !== 'POST') return json({ error: 'POST kell' }, 405);
      // Cloudflare Access mögött vagyunk — az Access-JWT hiánya gyanús.
      if (!request.headers.get('cf-access-jwt-assertion')) return json({ error: 'nincs Access-azonosítás' }, 401);

      const body = await request.json().catch(() => ({}));
      const ticker = String(body.ticker || '').trim().toUpperCase();
      if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return json({ error: 'érvénytelen ticker' }, 400);
      if (!env.GH_TOKEN || !env.GH_REPO) return json({ error: 'GH_TOKEN / GH_REPO nincs beállítva' }, 500);

      const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/company.yml/dispatches`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${env.GH_TOKEN}`,
          'accept': 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'ortorony-dashboard',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ ref: env.GH_BRANCH || 'main', inputs: { ticker } })
      });
      if (r.status === 204) return json({ ok: true, ticker });
      return json({ error: `GitHub ${r.status}: ${await r.text()}` }, 502);
    }

    // minden más: statikus fájl
    return env.ASSETS.fetch(request);
  }
};

const json = (v, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
