# Őrtorony — napi piac- & szektor-jelentés

Saját célú, automatizált napi jelentés-rendszer. A **tartalomgyártás** (menetrendezett
futások) és a **megjelenítés** (statikus weboldal) szét van választva: minden futás egy
strukturált JSON-t ír a `data/` mappába, a dashboard pedig ezt olvassa be és rendereli.
Új modul = új adat, a megjelenítőhöz nem kell hozzányúlni.

## Mappaszerkezet

```
index.html                      a data-vezérelt dashboard (beágyazott mintával is renderel)
data/
  latest.json                   a teljes oldal aktuális tartalma (ezt olvassa a dashboard)
  archive/2026-08-27.json       napi pillanatképek
  archive/index.json            az archívum listája
scripts/generate.mjs            a "ragasztó": Claude API + webkeresés → napi jelentés JSON
.github/workflows/daily.yml     ütemező: hétköznap reggel generál és commitol
```

## Hogyan olvas a dashboard

Az `index.html` betöltéskor lekéri a `./data/latest.json`-t, és abból építi a füleket.
Ha nincs kiszolgáló (pl. duplakattintással, `file://`), a beágyazott mintát mutatja.
Kiszolgálón (GitHub Pages) mindig a `latest.json` friss tartalma jelenik meg.

## Beállítás (egyszeri)

1. **Repo**: tedd fel ezt a mappát egy privát GitHub repóba.
2. **API-kulcs**: repo → Settings → Secrets and variables → Actions → New secret:
   név `ANTHROPIC_API_KEY`, érték az Anthropic API-kulcsod.
3. **Hosztolás és hozzáférés** — két út:
   - **Privát megosztás (ajánlott, e-mailes belépés):** kösd a repót **Cloudflare Pages**-hez
     (ingyenes; minden commitnál újrapublikál, így a napi adat magától frissül), majd tedd elé
     **Cloudflare Access**-t (Zero Trust, ingyenes 50 felhasználóig). Access-szabály: Action =
     Allow, Selector = Emails; add hozzá a saját és a barátaid e-mail-címét. Belépés jelszó
     nélkül, e-mailre küldött egyszeri kóddal (One-time PIN). Csak a felsorolt címek férnek
     hozzá, mobilon/tableten is. A forrás-repó privát marad, az oldal nem publikus.
   - **Nyilvános:** GitHub Pages (Settings → Pages → Deploy from a branch, `main` / root).
     Ekkor az oldal bárki számára elérhető, aki tudja a címet — csak akkor válaszd, ha ez nem baj.
4. **Ütemezés**: a `daily.yml` hétköznap 05:00 UTC-kor fut. Kézzel is indíthatod:
   repo → Actions → *Napi jelentés* → *Run workflow*.

## Melyik modult mi tölti

| Fül | Ki tölti | Miért |
|-----|----------|-------|
| Napi jelentés | GitHub Actions + Claude API (`generate.mjs`) | webkeresés, konnektor nélkül fut |
| ETF, Opciós piac, Makró | ugyanígy bővíthető külön promptokkal | webes/tőzsdei adat |
| Hírlevél-napló (Gmail) | **Cowork** menetrendezett feladat | Gmail-konnektor kell |
| Szentiment / X-jelzés | **Cowork** (beépített böngésző) | X-login, böngésző kell |

A GitHub Actions nem fut Gmail/X-konnektorral és böngésző-loginnal — ezért a Gmail és X
modult **Cowork** tölti. Két egyszerű mód, hogy a Cowork-tartalom is kikerüljön az oldalra:

- **Egyszerű**: a Cowork-feladat írja a saját fülének JSON-tömbjét, és te (vagy egy külön
  kis lépés) beilleszted a `data/latest.json` megfelelő `tabs[...]` elemébe, majd commitolod.
- **Automatizáltabb**: a Cowork mentse a kimenetet egy `data/incoming/` fájlba a repo
  mappájában, és a `daily.yml`-hez adj egy lépést, ami ezeket beolvasztja a `latest.json`-ba.

A `generate.mjs` szándékosan **csak a `tech` (Napi jelentés) fület** írja felül, a többit
érintetlenül hagyja — így a Cowork által frissített fülek megmaradnak.

## Bővítés (ETF / Opciós / Makró Actions-ből)

Másold a `generate.mjs` mintáját: adj neki egy modul-specifikus promptot és a fül sémáját,
majd a `site.tabs.find(t=>t.id==="etf")` elemet írd felül. Egy futásban több API-hívással
több fül is frissíthető.

## Adat-séma (röviden)

Minden fül vagy `sections` + `rail`, vagy `empty`, vagy `archive`. Egy szekció `items`
(tétel: `lead`, `tags:[{t,k}]`, `why`, `src:[]`) vagy `body:[bekezdés]`. Címke-kulcsok:
`ok` (megerősítve), `spec` (nincs megerősítve / becslés), `mood` (közhangulat),
`skip` (kihagyva/OI-alapú), `flag` (gyanús), és ETF-változás badge-ek
(`index, fee, merge, close, repl, dom, name`).

## Költség

Napi egy Sonnet-futás webkereséssel jellemzően pár centtől néhány tíz centig terjed a
jelentés hosszától és a keresések számától függően. A `max_uses` a `generate.mjs`-ben
korlátozza a kereséseket.

---

**Nem befektetési tanács.** A rendszer tájékoztató jellegű kontextust ad; a döntést a
felhasználó hozza. Saját célú projekt.
