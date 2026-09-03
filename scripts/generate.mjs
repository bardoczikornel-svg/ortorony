// generate.mjs — az Őrtorony "ragasztója".
// Meghívja a Claude API-t (webkereséssel), előállítja a NAPI JELENTÉS fül JSON-ját
// a séma szerint, majd BEOLVASZTJA a data/latest.json-ba (a többi fület érintetlenül
// hagyva), és archivál. Node 20+ kell (globális fetch).
//
// Futtatás:  ANTHROPIC_API_KEY=... node scripts/generate.mjs
//
// Bővítés: ugyanígy legyárthatod az 'etf', 'options', 'macro' füleket is (külön
// promptokkal). A Gmail (Hírlevél-napló) és X (Szentiment) füleket NEM ez tölti —
// azok konnektort/böngészőt igényelnek, ezért Cowork írja őket (lásd README).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data", "latest.json");
const ARCH = join(ROOT, "data", "archive");
const MODEL = process.env.ORTORONY_MODEL || "claude-sonnet-5"; // válts modellt itt
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("Hiányzik az ANTHROPIC_API_KEY."); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);

// ---- A jelentésgyártó utasítás + a kötelező kimeneti séma ----
const PROMPT = `
Hosszútávú (NEM daytrade) piac/makró-elemző vagy. Zajszűrés: strukturális elmozdulások,
nem napi ármozgás. Nem adsz ügyleti utasítást. NEM vagy befektetési tanácsadó.

FELADAT: készítsd el a mai NAPI JELENTÉST magyarul. Webes keresés KÖTELEZŐ az elmúlt
~24 óra eseményeire; minden érdemi állításnál forrás + dátum. Válaszd el a MEGERŐSÍTETT
tényt a SPEKULÁCIÓTÓL. Ne találj ki adatot.

Szekciók: B) tegnap mozgatói (3-6 tétel) · G) tech szektor (félvezető, AI-capex, memória) ·
EN) energia szektor (ATOM és ÚJ ENERGIA kiemelten) · I) ellenoldal/kockázat (steelman) ·
C) ma figyelendő. Rail: D) szentiment, H) amit figyelmen kívül hagynék, F) rotáció.
Rezsim-olvasat egy mondatban.

KIZÁRÓLAG a következő JSON-t add vissza, semmi mást (se magyarázat, se \`\`\`):
{
  "regime": { "state": "risk-on|risk-off|transition", "label": "...", "text": "egy mondat, <b> megengedett" },
  "tab": {
    "id": "tech", "label": "Napi jelentés", "hero": true,
    "sections": [
      { "letter": "B", "heading": "Tegnap mozgatói", "items": [
        { "lead": "cím", "tags": [{"t":"megerősítve","k":"ok"}], "why": "1 mondat: mi + miért számít", "src": ["forrás","dátum"] }
      ]},
      { "letter": "G", "heading": "Tech szektor csomag — félvezető & AI-infra", "body": ["bekezdés", "bekezdés"] },
      { "letter": "EN", "letterStyle": "font-size:11px", "heading": "Energia szektor — atom & új energia kiemelten", "body": ["atom bekezdés", "új energia bekezdés"] },
      { "letter": "I", "heading": "Ellenoldal / kockázat — steelman", "body": ["bekezdés"] },
      { "letter": "C", "heading": "Ma figyelendő", "body": ["bekezdés"] }
    ],
    "rail": [
      { "lt": "D", "heading": "Szentiment — pillanatkép",
        "metrics": [{"k":"Fear &amp; Greed","v":"érték / 100"},{"k":"AAII bull–bear","v":"..."},{"k":"Put/call arány","v":"..."},{"k":"Kripto funding","v":"..."}],
        "note": "Közelítés, nem pontos pozicionáltság." },
      { "lt": "H", "heading": "Amit figyelmen kívül hagynék", "list": ["...", "..."] },
      { "lt": "F", "heading": "Rotáció-figyelő", "note": "van jel / nincs, indoklással" }
    ]
  }
}
A "tags" kulcsok: k ∈ {ok=megerősítve, spec=nincs megerősítve/becslés, mood=közhangulat}.`;

const body = {
  model: MODEL,
  max_tokens: 8000,
  messages: [{ role: "user", content: PROMPT }],
  tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
};

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error("API hiba:", res.status, await res.text()); process.exit(1); }
const out = await res.json();

// A szöveges blokkok összefűzése, JSON kiemelése
const text = (out.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
const jsonStr = text.replace(/```json|```/g, "").trim().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
let parsed;
try { parsed = JSON.parse(jsonStr); }
catch (e) { console.error("Nem sikerült JSON-t parse-olni. Nyers válasz:\n", text.slice(0, 1500)); process.exit(1); }

// Beolvasztás: a többi fül marad, csak a 'tech' + regime + meta frissül
const site = JSON.parse(readFileSync(DATA, "utf8"));
const i = site.tabs.findIndex(t => t.id === "tech");
site.tabs[i] = parsed.tab;
site.regime = parsed.regime;
site.meta = { ...site.meta, date: today, run: `automatikus (${new Date().toISOString()})`, demo: false };

writeFileSync(DATA, JSON.stringify(site, null, 2));

// Archiválás + index frissítés
if (!existsSync(ARCH)) mkdirSync(ARCH, { recursive: true });
writeFileSync(join(ARCH, `${today}.json`), JSON.stringify(site, null, 2));
const idxPath = join(ARCH, "index.json");
const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : [];
if (!idx.find(x => x.date === today)) idx.unshift({ date: today, file: `archive/${today}.json` });
writeFileSync(idxPath, JSON.stringify(idx, null, 2));
// az archívum-fül lista frissítése a latest.json-ban
const at = site.tabs.find(t => t.id === "archive");
if (at) at.archive = idx.slice(0, 30);
writeFileSync(DATA, JSON.stringify(site, null, 2));

console.log("Kész:", today, "— napi jelentés frissítve és archiválva.");
