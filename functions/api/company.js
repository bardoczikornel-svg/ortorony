// Cloudflare Pages Function — POST /api/company  { "ticker": "NVDA" }
// Elindítja a .github/workflows/company.yml workflow-t workflow_dispatch-csel.
// Env (Cloudflare Pages → Settings → Environment variables, Production + Preview):
//   GH_TOKEN   fine-grained PAT, csak erre a repóra, jogosultság: Actions → Read and write
//   GH_REPO    "felhasznalo/repo"
//   GH_BRANCH  alapból "main"

export async function onRequestPost({ request, env }) {
  // Cloudflare Access mögött vagyunk — az Access által beszúrt JWT-fejléc hiánya gyanús, elutasítjuk.
  if (!request.headers.get('cf-access-jwt-assertion')) {
    return json({ error: 'nincs Access-azonosítás' }, 401);
  }
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

const json = (v, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
