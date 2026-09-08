# Nauci AI MCP server (P2 - studio alati)

MCP (Model Context Protocol) server platforme živi na Convex HTTP ruteru, po
istoj arhitekturi kao Higgsfield MCP: **Streamable HTTP** transport na putanji
`/mcp`, **JSON-RPC 2.0**, **Bearer** autentikacija API ključem. P1 je dokazao
transport jednim trivijalnim alatom (`whoami`); P2 (MCP-P2-STUDIO) dodaje šest
studio alata, opseg `mcp:write` i UI stranu za ključeve.

> **`mcp:write` TROŠI KREDITE.** Alat `create_generation` rezerviše posao i
> skida kredite sa salda vlasnika ključa, isto kao klik na „Generiši" u
> Studiju. Ključ sa tim opsegom se pravi svesno, izborom „Čitanje i pisanje"
> na strani ključeva; podrazumevani ključ je samo za čitanje.

| Okruženje | URL servera |
| --- | --- |
| prod | `https://quick-yak-270.eu-west-1.convex.site/mcp` |
| dev | `https://wandering-fox-41.eu-west-1.convex.site/mcp` |

Kod: `convex/mcp/` (transport, protokol, registar alata, studio alati, rate
limit, ključ), `convex/mcpKeys.ts` (Convex funkcije za ključeve), rute u
`convex/http.ts`, tabela `mcpApiKeys` u `convex/schema.ts`, UI u
`components/app/api-keys-page.tsx` (ruta `/app/profile/api-keys`).

---

## 1. Kako se dobija ključ

Ključ ima oblik `nai_live_` + 43 base62 znaka (32 nasumična bajta). U bazi
stoji **samo sha256 heš** i prvih 12 znakova za prikaz; pun ključ se vraća
**tačno jednom**, pri kreiranju. Ako se izgubi, pravi se nov.

### Kroz UI (od P2)

Prijavljen korisnik -> Profil -> „API ključevi (MCP)" (`/app/profile/api-keys`).
Strana lista ključeve (ime, prefiks, opsezi, kreiran, poslednja upotreba),
pravi nov ključ sa izborom opsega („Samo čitanje" ili „Čitanje i pisanje" -
uz upozorenje da pisanje troši kredite), pokazuje pun ključ **tačno jednom**
sa dugmetom za kopiranje, i opoziva ključ uz potvrdu. Svaki korisnik vidi
samo svoje ključeve; strana nije admin funkcija.

### Kroz CLI

I dalje radi, **kao prijavljeni korisnik**. Potreban je `_id` korisnika iz
tabele `users` (Convex dashboard -> Data -> users). Convex Auth čita korisnika
iz `subject` polja identiteta (deo pre `|`), pa se on prosleđuje `--identity`
zastavicom.

PowerShell, dev deployment:

```
npx convex run mcpKeys:createKey '{"name":"Claude Desktop"}' --identity '{"subject":"<USERS_ID>|cli","tokenIdentifier":"cli|<USERS_ID>"}'
```

Sa opsegom za pisanje: `'{"name":"Claude Code","scopes":["mcp:read","mcp:write"]}'`.
Nepoznat opseg se odbija (`NEPOZNAT_OPSEG`), prazan spisak takođe
(`NEISPRAVNI_OPSEZI`).

Za prod dodati `--prod`. Odgovor sadrži `key` - to je jedini trenutak u kom
se pun ključ vidi:

```json
{ "keyId": "...", "key": "nai_live_...", "prefix": "nai_live_abc" }
```

Ostale funkcije (iste `--identity` zastavice):

- `mcpKeys:listMyKeys` - `{}` - prefix, ime, opsezi, `createdAt`, `lastUsedAt`,
  `revokedAt`; bez heša.
- `mcpKeys:revokeKey` - `{"keyId":"..."}` - upisuje `revokedAt`, red se ne
  briše. Tuđi ključ daje `NEMA_PRISTUPA`, isto kao nepostojeći.

### Opsezi

| Opseg | Šta otključava | Troši kredite | Rate limit |
| --- | --- | --- | --- |
| `mcp:read` | `whoami`, `list_models`, `get_studio_state`, `list_projects`, `get_job`, `list_my_jobs` | ne | 60 zahteva/min po ključu (svaki HTTP zahtev) |
| `mcp:write` | `create_generation` | **da** | dodatnih 10 poziva/min po ključu |

- Bez `scopes` ključ dobija tačno `["mcp:read"]`. Ključevi napravljeni u P1
  ostaju samo na `mcp:read` - write im se ne dodaje retroaktivno.
- `mcp:write` se dodaje SAMO uz `mcp:read` (UI nudi „Čitanje i pisanje"); sam
  po sebi ne otključava alate za čitanje.
- Alat kojem ključ nema opseg vraća `isError: true` sa porukom
  `Key is missing scope "mcp:write" required by tool "create_generation".` -
  rezultat alata, ne JSON-RPC greška, da model vidi zašto.
- Sve provere Studija važe i kroz MCP: kill switch (`STUDIO_PAUZIRAN`),
  pristup (`NEMA_PRISTUPA`, `EMAIL_NIJE_POTVRDJEN`), prihvaćeni uslovi, limiti
  poslova i dnevni limiti, saldo. Ključ ne može ništa što vlasnik ne može iz
  Studija.

---

## 2. Klijenti

### Claude Code

Jedna komanda (Streamable HTTP transport sa Bearer zaglavljem):

```
claude mcp add --transport http nauciai https://quick-yak-270.eu-west-1.convex.site/mcp --header "Authorization: Bearer nai_live_..."
```

Ili u `.mcp.json` (u korenu projekta) - ključ ostaje u okruženju, ne u fajlu:

```json
{
  "mcpServers": {
    "nauciai": {
      "type": "http",
      "url": "https://quick-yak-270.eu-west-1.convex.site/mcp",
      "headers": { "Authorization": "Bearer ${NAUCIAI_MCP_KEY}" }
    }
  }
}
```

Provera: `claude mcp list` treba da pokaže `nauciai` kao povezan, a u
razgovoru alat `whoami` vraća id i email korisnika, a `list_models` katalog.

### Claude Desktop

Claude Desktop u konektorima traži OAuth, koji P1 nema (samo Bearer). Zato se
ide preko `mcp-remote` mosta u `claude_desktop_config.json`
(Settings -> Developer -> Edit Config). Zaglavlje se prosleđuje iz env
promenljive - na Windowsu `mcp-remote` ne podnosi razmak u argumentu, pa je
ceo `Bearer ...` u promenljivoj:

```json
{
  "mcpServers": {
    "nauciai": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://quick-yak-270.eu-west-1.convex.site/mcp",
        "--header",
        "Authorization:${NAUCIAI_AUTH}"
      ],
      "env": { "NAUCIAI_AUTH": "Bearer nai_live_..." }
    }
  }
}
```

Posle izmene restartovati Claude Desktop; `whoami` se pojavljuje među alatima.

### Ručna provera (curl / PowerShell)

```
curl -s https://quick-yak-270.eu-west-1.convex.site/mcp -H "Authorization: Bearer nai_live_..." -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

Očekivano: `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"userId\":...}"}]}}`.

---

## 3. Šta server podržava

JSON-RPC metode:

| Metoda | Odgovor |
| --- | --- |
| `initialize` | `{protocolVersion, capabilities:{tools:{}}, serverInfo:{name:"nauciai", version}}` |
| `notifications/initialized` | bez odgovora (HTTP 202) |
| `ping` | `{}` |
| `tools/list` | `{tools:[{name, description, inputSchema}]}` |
| `tools/call` | `{content:[{type:"text", text}], isError?}` |

Verzija protokola: server vraća verziju koju klijent traži ako je među
`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`; inače `2025-06-18`.
Batch zahtevi (niz) rade; server je bez stanja i ne izdaje `Mcp-Session-Id`.

### Alati

Svaki alat ima JSON Schemu ulaza (`type: "object"`, eksplicitna `properties`,
`required`, `additionalProperties: false`). Ulaz se proverava PRE poziva u
Convex; odstupanje je JSON-RPC `-32602`. Rezultat je `content[0].text` sa JSON
tekstom; `isError: true` znači domensku grešku sa čitljivom porukom na srpskom
i kodom u zagradi.

| Alat | Opseg | Ulaz | Izlaz |
| --- | --- | --- | --- |
| `whoami` | `mcp:read` | nema | `{userId, email, keyName, scopes}` |
| `list_models` | `mcp:read` | nema | niz uključenih modela: `{slug, kind, provider, family, labelSr, labelEn, taglineSr, inputModes, paramSpec, priceRule, capabilities}` (JSON polja parsirana) |
| `get_studio_state` | `mcp:read` | nema | `studio.getStudioState` polja (`enabled`, `hasStudioAccess`, `accessReason`, `hasAcceptedTerms`, `activeJobs`, `maxActiveJobs`, `providerStatus`, ...) + `credits: {balance, lifetimePurchased, lifetimeSpent, updatedAt}` |
| `list_projects` | `mcp:read` | nema | `{projects: [{id, name, createdAt}]}` - samo nearhivirani |
| `create_generation` | **`mcp:write`** | `modelSlug` (string), `params` (objekat po `paramSpec`-u modela, npr. `{"prompt": "..."}`), `projectId?` (string) | `{jobId, status, creditCost, modelSlug}`; domenska greška -> `isError` (npr. `... (STUDIO_PAUZIRAN)`, `... (NEDOVOLJNO_KREDITA)`, `... (MODEL_NEDOSTUPAN)`, `... (DNEVNI_LIMIT)`, `... (PREVISE_POSLOVA)`); pogodak blok liste -> `isError` sa `ZABRANJEN_POJAM` |
| `get_job` | `mcp:read` | `jobId` (string) | `{jobId, status, modelSlug, kind, creditCost, createdAt, completedAt, params, outputUrl, expiresAt, error, isMock}`; `outputUrl` je potpisan URL SAMO kad je `status: "done"`; tuđ, nepostojeći ili neparsiv id -> `isError` „Posao nije pronađen." |
| `list_my_jobs` | `mcp:read` | `limit?` (1-50, podrazumevano 20), `kind?` (`image`/`video`/`audio`), `modelSlug?`, `projectId?`, `cursor?` | `{jobs: [...isti oblik kao get_job], nextCursor, isDone}`; `nextCursor` ide u `cursor` sledećeg poziva, `null` kad je kraj |

`create_generation` prima `params` kao objekat i sam ga serijalizuje u JSON
string koji `studio.createJob` očekuje. Status posla se prati kroz `get_job`
(`reserved` -> `running` -> `done`/`failed`/`refunded`).

Identitet: MCP pozivalac nema Convex Auth sesiju, pa alati zovu INTERNE
varijante studio funkcija (`createJobInternal`, `listMyJobsInternal`,
`getJobForDetailInternal`, `getStudioStateInternal`, `listModelsInternal`,
`listActiveProjectsInternal`, `getBalanceInternal`) koje primaju `userId` iz
ključa i dele telo (`...ForUser`) sa javnim funkcijama - jedna odluka o
pristupu i limitima za oba puta. Interne varijante nisu u `api`.

Transport:

- `POST /mcp` - JSON-RPC telo; odgovor je `application/json`, a ako klijent
  pošalje `Accept: text/event-stream`, jedan SSE okvir (`event: message`) po
  odgovoru.
- `OPTIONS /mcp` - CORS preflight (`*`; `Authorization`, `Content-Type`,
  `Mcp-Session-Id`, `Mcp-Protocol-Version`).
- `GET /mcp` - 405 (nema server-strane SSE struje).

Greške:

| Situacija | HTTP | JSON-RPC kod |
| --- | --- | --- |
| bez/neispravno/nepostojeće/revokovano Bearer zaglavlje | 401 | -32001 (uvek ista poruka, bez razloga) |
| više od 60 zahteva u minutu po ključu | 429 + `Retry-After` | -32002 |
| više od 10 `mcp:write` poziva u minutu po ključu | 200 | -32002 sa `data.retryAfterSeconds` |
| telo veće od 1 MB | 413 | -32003 |
| loš JSON | 400 | -32700 |
| neispravan JSON-RPC zahtev | 400 | -32600 |
| nepoznata metoda ili nepoznat alat | 200 | -32601 |
| neispravni parametri | 200 | -32602 |
| neočekivana greška (nikad stack trace) | 200 / 500 | -32603 |

Rate limit je u memoriji izolata (`convex/mcp/rateLimit.ts`), razdvojen po
opsegu: čitanje 60 zahteva/min (transport, svaki zahtev), pisanje dodatnih 10
poziva/min (registar alata, po `tools/call`). Granica je labava kad Convex
podigne više izolata; interfejs je zamenljiv tabelom. `lastUsedAt` se osvežava
najviše jednom u minutu po ključu i nikad ne obara zahtev.

---

## 4. Šta je P2 doneo i šta ostaje

P2 (MCP-P2-STUDIO): šest studio alata (`convex/mcp/studioTools.ts`), opseg
`mcp:write`, `createKey` sa `scopes`, rate limit po opsegu, UI strana za
ključeve pod profilom, interne `*Internal` varijante studio funkcija.

Ostaje za kasnije: rate limit u tabeli (ili `@convex-dev/rate-limiter`) umesto
memorije. Nije planirano: OAuth (ostaje Bearer), `resources/` i `prompts/` MCP
primitivi.
