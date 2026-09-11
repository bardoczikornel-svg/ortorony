// Őrtorony — Modul 02: vállalati mély-elemzés
// Használat:
//   node scripts/company.mjs IREN            → egy ticker, on-demand
//   node scripts/company.mjs --rotate        → a watchlist follow:true tételei közül a legrégebben elemzett
// Env: ANTHROPIC_API_KEY (kötelező), OT_MODEL (opcionális; alapból ugyanaz, mint a generate.mjs-ben)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const DIR = path.join(ROOT, 'data', 'company');
const PROMPT = path.join(ROOT, 'prompts', 'company-elemzes.md');
const MODEL = process.env.OT_MODEL || 'claude-sonnet-5';
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY hiányzik'); process.exit(1); }

fs.mkdirSync(DIR, { recursive: true });
const readJson = (p, fb) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fb;
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const idxPath = path.join(DIR, 'index.json');
const wlPath = path.join(DIR, 'watchlist.json');
let index = readJson(idxPath, []);
let watchlist = readJson(wlPath, []);

// --- ticker kiválasztása ---
let ticker = process.argv.find(a => /^[A-Z0-9.\-]{1,10}$/.test(a) && !a.startsWith('--'));
if (process.argv.includes('--rotate')) {
  const due = watchlist.filter(w => w.follow).sort((a, b) => (a.last_deep || '').localeCompare(b.last_deep || ''));
  if (!due.length) { console.log('nincs follow:true tétel a watchlistben'); process.exit(0); }
  ticker = due[0].ticker;
}
if (!ticker) { console.error('adj meg egy tickert, pl. node scripts/company.mjs IREN'); process.exit(1); }
ticker = ticker.toUpperCase();

const today = new Date().toISOString().slice(0, 10);
const system = fs.readFileSync(PROMPT, 'utf8');
const wl = watchlist.find(w => w.ticker === ticker);
const user = [
  `Elemezd a következő céget: ${ticker}.`,
  wl?.name ? `Cégnév: ${wl.name}.` : '',
  wl?.keywords?.length ? `Kulcsszavak a kereséshez: ${wl.keywords.join(', ')}.` : '',
  `Mai dátum: ${today}. A meta.date legyen "${today}", a meta.run "on-demand (GitHub Actions)", a meta.follow ${wl ? !!wl.follow : true}.`,
  'Webes kereséssel dolgozz: elsődlegesen SEC/kibocsátói dokumentumok, utána sajtó. Minden állításnál forrás + dátum.',
  'A VÁLASZ KIZÁRÓLAG a sémának megfelelő, érvényes JSON legyen — semmi bevezető, semmi magyarázat, semmi ``` jelölés, semmi <cite> tag.'
].filter(Boolean).join('\n');

// --- API hívás ---
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 25 }]
  })
});
if (!res.ok) { console.error('API hiba', res.status, await res.text()); process.exit(1); }
const data = await res.json();
console.log(`stop_reason: ${data.stop_reason} · output tokens: ${data.usage?.output_tokens} · keresések: ${(data.content||[]).filter(b=>b.type==='server_tool_use').length}`);
if (data.stop_reason === 'max_tokens') console.error('FIGYELEM: a válasz elérte a max_tokens határt — a JSON valószínűleg csonka.');

// --- szöveg kinyerése + cite-strip + JSON kivágás (mint a generate.mjs-ben) ---
let text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
text = text.replace(/<\/?cite[^>]*>/g, '').replace(/```json|```/g, '');
const a = text.indexOf('{'), z = text.lastIndexOf('}');
if (a < 0 || z < 0) { console.error('nincs JSON a válaszban. A válasz eleje:\n', text.slice(0, 1500)); process.exit(1); }
let doc;
const candidate = text.slice(a, z + 1)
  .replace(/,\s*([}\]])/g, '$1');          // záró vessző javítása
try { doc = JSON.parse(candidate); }
catch (e) {
  console.error('JSON parse hiba:', e.message, '— javító kör kényszerített eszközhívással…');
  doc = await repairJson(candidate, e.message);
}

// --- javító kör: a modell tool_use-ként adja vissza, az API garantálja az érvényes JSON-t ---
async function repairJson(broken, errMsg) {
  const schema = {
    type: 'object',
    properties: {
      meta: { type: 'object' }, verdict: { type: 'object' },
      sections: { type: 'array', items: { type: 'object' } },
      rail: { type: 'array', items: { type: 'object' } }
    },
    required: ['meta', 'verdict', 'sections', 'rail']
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 32000,
      system: 'Egy hibás JSON-dokumentumot kapsz. Add vissza PONTOSAN ugyanazt a tartalmat érvényes JSON-ként az emit_company eszközön keresztül. Ne rövidíts, ne hagyj ki tételt, ne fogalmazz át — csak a szintaxist javítsd (idézőjelek escape-elése, vesszők, zárójelek).',
      messages: [{ role: 'user', content: `Parse-hiba: ${errMsg}\n\nHibás JSON:\n${broken}` }],
      tools: [{ name: 'emit_company', description: 'A javított cégelemzés-dokumentum', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'emit_company' }
    })
  });
  if (!r.ok) { console.error('javító hívás API hiba', r.status, await r.text()); process.exit(1); }
  const d = await r.json();
  const tu = (d.content || []).find(b => b.type === 'tool_use');
  if (!tu) { fs.writeFileSync(path.join(DIR, `${ticker}-${today}.raw.txt`), broken); console.error('a javító kör nem adott tool_use blokkot — nyers mentve .raw.txt-be'); process.exit(1); }
  console.log('javító kör sikeres.');
  return tu.input;
}

// --- meta normalizálás ---
doc.meta = Object.assign({ ticker, date: today, run: 'on-demand (GitHub Actions)', currency: 'USD' }, doc.meta || {});
doc.meta.ticker = ticker; doc.meta.date = today;
if (wl) doc.meta.follow = !!wl.follow;

// --- fájlok írása ---
const file = `company/${ticker}-${today}.json`;
writeJson(path.join(DIR, `${ticker}-${today}.json`), doc);

index = index.filter(e => !(e.ticker === ticker && e.date === today));
index.unshift({
  ticker, name: doc.meta.name || wl?.name || ticker, date: today, file,
  oneliner: (doc.verdict?.text || '').replace(/<[^>]+>/g, '').slice(0, 220),
  state: doc.verdict?.state || 'transition'
});
index.sort((x, y) => y.date.localeCompare(x.date));
writeJson(idxPath, index);

if (wl) { wl.last_deep = today; if (!wl.name && doc.meta.name) wl.name = doc.meta.name; }
else watchlist.push({ ticker, name: doc.meta.name || ticker, follow: true, keywords: [ticker], last_deep: today });
writeJson(wlPath, watchlist);

console.log(`kész: data/${file} · index: ${index.length} tétel · watchlist: ${watchlist.length} ticker`);
