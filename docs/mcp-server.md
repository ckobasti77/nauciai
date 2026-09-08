# Nauci AI MCP server (P4 - OAuth 2.1, instalacija bez ručnog ključa)

MCP (Model Context Protocol) server platforme živi na Convex HTTP ruteru, po
istoj arhitekturi kao Higgsfield MCP: **Streamable HTTP** transport na putanji
`/mcp`, **JSON-RPC 2.0**, **Bearer** autentikacija - API ključem **ili OAuth
access tokenom**. P1 je dokazao transport jednim trivijalnim alatom (`whoami`);
P2 (MCP-P2-STUDIO) je dodao šest studio alata, opseg `mcp:write` i UI stranu za
ključeve; P3 (MCP-P3-ULAZI) okačivanje fajlova (`create_upload_url`,
`register_upload`), poslove sa ulazom (`create_generation` sa
`inputMode`/`inputs`/`sourceJobId`), čekanje na rezultat (`wait_for_job`) i
potpisan URL izlaza (`get_output_url`); P4 (MCP-P4-OAUTH) dodaje **OAuth 2.1 sa
PKCE i dinamičkom registracijom klijenta**, pa se server u Claude Desktop /
claude.ai / Claude Code dodaje samo URL-om - klijent klikne „Connect", korisnik
se prijavi, odobri pristup, i klijent dobije token (sekcija 6). Bearer put sa
`nai_live_` ključem ostaje nepromenjen.

> **`mcp:write` TROŠI KREDITE.** Alat `create_generation` rezerviše posao i
> skida kredite sa salda vlasnika ključa, isto kao klik na „Generiši" u
> Studiju. Ključ sa tim opsegom se pravi svesno, izborom „Čitanje i pisanje"
> na strani ključeva; podrazumevani ključ je samo za čitanje.

| Okruženje | URL servera |
| --- | --- |
| prod | `https://quick-yak-270.eu-west-1.convex.site/mcp` |
| dev | `https://wandering-fox-41.eu-west-1.convex.site/mcp` |

Kod: `convex/mcp/` (transport, protokol, registar alata, studio alati, rate
limit, ključ), `convex/mcpKeys.ts` (Convex funkcije za ključeve), `convex/oauth/`
(OAuth 2.1: `core.ts` čisto jezgro, `authorizeRequest.ts` parametri
autorizacije, `server.ts` Convex funkcije, `http.ts` endpointi, `urls.ts`
origini), rute u `convex/http.ts`, tabele `mcpApiKeys`, `oauthClients`,
`oauthAuthCodes`, `oauthTokens` u `convex/schema.ts`, UI u
`components/app/api-keys-page.tsx` (ruta `/app/profile/api-keys`, ključevi +
povezane aplikacije) i `components/app/oauth-consent-page.tsx` (ekran pristanka,
ruta `/oauth/authorize`).

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
tabele `users` (Convex dashboard -> Data -> users, ili `npx convex data users`).
Convex Auth čita korisnika iz `subject` polja identiteta (deo pre `|`), pa se
on prosleđuje `--identity` zastavicom.

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
| `mcp:read` | `whoami`, `list_models`, `get_studio_state`, `list_projects`, `get_job`, `wait_for_job`, `get_output_url`, `list_my_jobs` | ne | 60 zahteva/min po ključu **po izolatu** (svaki HTTP zahtev) |
| `mcp:write` | `create_upload_url`, `register_upload`, `create_generation` | **da** (`create_generation`; upload alati pune skladište) | dodatnih 10 poziva/min po ključu **po izolatu** |

- Bez `scopes` ključ dobija tačno `["mcp:read"]`. Ključevi napravljeni u P1
  ostaju samo na `mcp:read` - write im se ne dodaje retroaktivno.
- `mcp:write` se dodaje SAMO uz `mcp:read` (UI nudi „Čitanje i pisanje"); sam
  po sebi ne otključava alate za čitanje.
- Alat kojem ključ nema opseg vraća `isError: true` sa porukom
  `Key is missing scope "mcp:write" required by tool "create_generation".` -
  rezultat alata, ne JSON-RPC greška, da model vidi zašto.
- Sve provere Studija važe i kroz MCP: kill switch (`STUDIO_PAUZIRAN`),
  pristup (`NEMA_PRISTUPA`, `EMAIL_NIJE_POTVRDJEN`), prihvaćeni uslovi
  (`USLOVI_NEPRIHVACENI`), limiti poslova (`PREVISE_POSLOVA`, `MINUTNI_LIMIT`),
  dnevni limiti, saldo, dozvola za upload i vlasništvo fajla. Ključ ne može
  ništa što vlasnik ne može iz Studija - P3 testovi to dokazuju i za običnog
  korisnika bez potvrđenog emaila, bez uslova, i sa punim brojem aktivnih
  poslova (`convex/mcp/studioTools.test.ts`).

---

## 2. Klijenti

### Claude Code

Od P4 dovoljan je URL - Claude Code sam prođe OAuth tok (otvori browser na
ekran pristanka, sekcija 6):

```
claude mcp add --transport http nauciai https://quick-yak-270.eu-west-1.convex.site/mcp
```

pa u razgovoru `/mcp` -> `nauciai` -> „Authenticate". Ključ i dalje radi kao i
pre, kad se ne želi browser (CI, agenti):

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

### Claude Desktop / claude.ai

Od P4 ide kao konektor, bez ključa: Settings -> Connectors -> „Add custom
connector" -> ime `Nauci AI`, URL `https://quick-yak-270.eu-west-1.convex.site/mcp`
-> „Add" -> „Connect". Otvara se browser na `nauciai.com/oauth/authorize`:
prijava (ako već nije), pa ekran pristanka sa imenom klijenta i opsezima
(`mcp:write` nosi upozorenje da troši kredite), „Dozvoli pristup" -> klijent
dobija token, alati se pojavljuju. Pristup se gasi u Profil -> „API ključevi"
-> „Povezane aplikacije" -> „Opozovi pristup".

Stari put preko `mcp-remote` mosta sa ključem i dalje radi (Bearer put je
nepromenjen), u `claude_desktop_config.json` (Settings -> Developer -> Edit
Config). Zaglavlje se prosleđuje iz env promenljive - na Windowsu `mcp-remote`
ne podnosi razmak u argumentu, pa je ceo `Bearer ...` u promenljivoj:

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
`required`, `additionalProperties: false`; `inputs` je jedina mapa sa
slobodnim ključevima i proverava se kao `slot -> niz stringova`). Ulaz se
proverava PRE poziva u Convex; odstupanje je JSON-RPC `-32602`. Rezultat je
`content[0].text` sa JSON tekstom; `isError: true` znači domensku grešku sa
čitljivom porukom na srpskom i kodom u zagradi.

| Alat | Opseg | Ulaz | Izlaz |
| --- | --- | --- | --- |
| `whoami` | `mcp:read` | nema | `{userId, email, keyName, scopes}` |
| `list_models` | `mcp:read` | nema | niz uključenih modela: `{slug, kind, provider, family, labelSr, labelEn, taglineSr, inputModes, inputSpec, paramSpec, priceRule, capabilities}` (JSON polja parsirana). `inputSpec` je `{ režim: { slot: { max, accept } } }` |
| `get_studio_state` | `mcp:read` | nema | `studio.getStudioState` polja (`enabled`, `hasStudioAccess`, `accessReason`, `hasAcceptedTerms`, `activeJobs`, `maxActiveJobs`, `providerStatus`, ...) + `credits: {balance, lifetimePurchased, lifetimeSpent, updatedAt}` |
| `list_projects` | `mcp:read` | nema | `{projects: [{id, name, createdAt}]}` - samo nearhivirani |
| `create_upload_url` | **`mcp:write`** | `slot` (string, iz `inputSpec`-a modela za izabrani režim) | `{uploadUrl, grantId, slot, accept, maxBytes, grantExpiresInSeconds: 3600, instructions}`; fajl se šalje **HTTP POST**-om na `uploadUrl` (Convex upload URL ne prima PUT - vraća 405), telo su sirovi bajtovi, `Content-Type` je MIME tip i **obavezan je** (bez njega Convex fajl zabeleži bez tipa, a `register_upload` ga onda odbija); odgovor je `{"storageId": "..."}`; `accept` i `maxBytes` su ono što slot prima |
| `register_upload` | **`mcp:write`** | `storageId` (iz odgovora na upload), `grantId` (iz `create_upload_url`), `slot` (isti kao u `create_upload_url`) | `{uploadId, storageId, slot, bytes, mimeType, durationS, measured, measureError?}`; **ulazna kapija (P3b)**: tip iz `_storage` mora da bude u `accept` listi slota, a veličina ispod `maxBytes` (slika 10 MB, video 200 MB, zvuk 50 MB) - fajl koji ne prođe se odbija **i briše iz skladišta** (`NEISPRAVAN_TIP_FAJLA`, `FAJL_PREVELIK`, `PRAZAN_FAJL`; dozvola ostaje nepotrošena, ali upload URL je jednokratan pa se traži nov); za video i zvuk odmah meri trajanje iz zaglavlja fajla (do 3 pokušaja kad `Range` čitanje padne); `durationS` je `null` za sliku (`measured: false`) ili kad merenje nije uspelo (tada `measureError` kaže šta dalje) |
| `create_generation` | **`mcp:write`** | `modelSlug` (string), `params` (objekat po `paramSpec`-u modela), `inputMode?` (iz `inputModes`), `inputs?` (`{ slot: [storageId, ...] }`), `sourceJobId?` (za režim iz `capabilities.continuation`), `projectId?` | `{jobId, status, creditCost, modelSlug}`; neispravan ulaz za model -> `isError` sa uputstvom (`NEISPRAVAN_REZIM`, `NEISPRAVNI_ULAZI`, `NEPOTPUN_ULAZ`, `NEISPRAVNI_PARAMETRI`, `IZVOR_NIJE_IZABRAN`, `IZVOR_NIJE_PODRZAN`, `MERENJE_NIJE_DOSTUPNO`); domenska greška servera -> `isError` (npr. `STUDIO_PAUZIRAN`, `NEDOVOLJNO_KREDITA`, `MODEL_NEDOSTUPAN`, `DNEVNI_LIMIT`, `PREVISE_POSLOVA`, `TUDJI_FAJL`); pogodak blok liste -> `ZABRANJEN_POJAM` |
| `get_job` | `mcp:read` | `jobId` (string) | `{jobId, status, modelSlug, kind, creditCost, createdAt, completedAt, params, outputUrl, expiresAt, error, isMock}`; `outputUrl` je potpisan URL SAMO kad je `status: "done"`; tuđ, nepostojeći ili neparsiv id -> `isError` „Posao nije pronađen." |
| `wait_for_job` | `mcp:read` | `jobId` (string), `timeoutSeconds?` (1-60, podrazumevano 30) | `{status, jobId, creditCost, outputs?, error?, timedOut}`; anketira svake 2 s dok posao ne stigne u završno stanje (`failed`, `refunded`, ili `done` sa SAČUVANIM izlazom / greškom čuvanja) ili dok budžet ne istekne; istek daje `timedOut: true` + `message` i NIJE greška - poziv se prosto ponovi; `outputs` je `{outputUrl, posterUrl, expiresAt}` |
| `get_output_url` | `mcp:read` | `jobId` (string) | `{jobId, kind, outputUrl, posterUrl, expiresAt}`; `posterUrl` je sličica videa ili `null`; `expiresAt` (ms od epohe) je trenutak kad izlaz ističe iz skladišta i URL prestaje da radi; posao koji nije `done` -> `POSAO_NIJE_GOTOV`, gotov a izlaz još nije preuzet -> `IZLAZ_U_PRIPREMI`, istekao -> `IZLAZ_ISTEKAO`; tuđi posao -> „Posao nije pronađen." |
| `list_my_jobs` | `mcp:read` | `limit?` (1-50, podrazumevano 20), `kind?` (`image`/`video`/`audio`), `modelSlug?`, `projectId?`, `cursor?` | `{jobs: [...isti oblik kao get_job], nextCursor, isDone}`; `nextCursor` ide u `cursor` sledećeg poziva, `null` kad je kraj |

`create_generation` prima `params` i `inputs` kao objekte i sam ih
serijalizuje u JSON stringove koje `studio.createJob` očekuje. Pre poziva u
Convex alat proverava narudžbinu protiv reda modela - režim protiv
`inputModes`, slotove i broj fajlova protiv `inputSpec`-a, obavezne slotove
po istim pravilima koja zaključavaju dugme u formi, parametre protiv
`paramSpec`-a (nepoznat parametar se odbija, ne preskače), `sourceJobId`
protiv `capabilities.continuation`, i izmereno trajanje kad model po
`priceRule` naplaćuje po trajanju - i vraća rečenicu koja kaže šta da se
ispravi. Server posle toga radi sve svoje provere iznova: prevod nije zamena.

Ulazna kapija fajla (MCP-P3b) živi u `studio.registerInputUploadForUser`, dakle
važi i za formu i za MCP: ISTA provera koju forma radi pre uploada
(`validateSlotFile` -> `slotFileProblem` u `convex/studioJobCore.ts`), nad
`contentType` i `size` koje je zabeležio `_storage`, ne nad onim što je
klijent rekao. Lista tipova se bira po IMENU slota (`video`, `audio`, sve
ostalo slika - `acceptForSlot`), a `studioJobCore.test.ts` tvrdi da svaka
`accept` lista u katalogu stane u nju. Razlika između dva puta: browser
`Content-Type` šalje uvek, pa javna mutacija fajl bez zabeleženog tipa
proverava samo po veličini; MCP put (`registerInputUploadInternal`) fajl bez
tipa odbija, jer je izostavljanje zaglavlja jedini način da se provera tipa
zaobiđe. Odbijen fajl kroz MCP alat se briše iz skladišta odmah (cron briše
samo prijavljene fajlove, pa bi inače ostao zauvek).

Identitet: MCP pozivalac nema Convex Auth sesiju, pa alati zovu INTERNE
varijante studio funkcija (`createJobInternal`, `createInputUploadUrlInternal`,
`registerInputUploadInternal`, `measureInputUploadInternal`,
`getUploadsForInputsInternal`, `listMyJobsInternal`, `getJobForDetailInternal`,
`getStudioStateInternal`, `listModelsInternal`, `listActiveProjectsInternal`,
`getBalanceInternal`) koje primaju `userId` iz ključa i dele telo (`...ForUser`)
sa javnim funkcijama - jedna odluka o pristupu, dozvoli i vlasništvu za oba
puta. Interne varijante nisu u `api`.

Transport:

- `POST /mcp` - JSON-RPC telo; odgovor je `application/json`, a ako klijent
  pošalje `Accept: text/event-stream`, jedan SSE okvir (`event: message`) po
  odgovoru. `Authorization: Bearer` nosi `nai_live_` ključ ILI `nai_oat_` OAuth
  access token (P4) - razlikuju se po prefiksu, oba daju isti `principal`.
- `401` nosi `WWW-Authenticate: Bearer realm="nauciai-mcp",
  resource_metadata="<site>/.well-known/oauth-protected-resource",
  scope="mcp:read mcp:write"` - po tome MCP klijent nalazi autorizacioni server
  (RFC 9728) i zna koje opsege da traži.
- `OPTIONS /mcp` - CORS preflight (`*`; `Authorization`, `Content-Type`,
  `Mcp-Session-Id`, `Mcp-Protocol-Version`).
- `GET /mcp` - 405 (nema server-strane SSE struje).

Greške:

| Situacija | HTTP | JSON-RPC kod |
| --- | --- | --- |
| bez/neispravno/nepostojeće/revokovano/isteklo Bearer zaglavlje (ključ ili OAuth token) | 401 + `WWW-Authenticate` | -32001 (uvek ista poruka, bez razloga) |
| više od 60 zahteva u minutu po ključu (po izolatu) | 429 + `Retry-After` | -32002 |
| više od 10 `mcp:write` poziva u minutu po ključu (po izolatu) | 200 | -32002 sa `data.retryAfterSeconds` |
| telo veće od 1 MB | 413 | -32003 |
| loš JSON | 400 | -32700 |
| neispravan JSON-RPC zahtev | 400 | -32600 |
| nepoznata metoda ili nepoznat alat | 200 | -32601 |
| neispravni parametri | 200 | -32602 |
| neočekivana greška (nikad stack trace) | 200 / 500 | -32603 |

### Rate limit - šta je granica, a šta brava

Rate limit je u memoriji izolata (`convex/mcp/rateLimit.ts`), razdvojen po
opsegu: čitanje 60 zahteva/min (transport, svaki zahtev), pisanje dodatnih 10
poziva/min (registar alata, po `tools/call`; obuhvata `create_upload_url`,
`register_upload` i `create_generation`). Brojevi važe **po izolatu**: Convex
sme da podigne više izolata za isti deployment, pa je stvarna granica po
ključu višekratnik ovih brojeva, ne tačno 10 ili 60. To je namerno
prigušivač, ne brava. **Prave brave su u bazi** i važe tačno, za svaki put
(forma i MCP): `studio.createJobForUser` odbija posao preko `MINUTNI_LIMIT`
(6/min za javne korisnike), `PREVISE_POSLOVA` (2 aktivna posla javni, 3
osoblje), `DNEVNI_LIMIT`, `DNEVNI_LIMIT_KREDITA`, `DNEVNI_LIMIT_TROSKA`,
`PREVISE_NEPORAVNATOG`; `studio.getOwnedUpload` gasi merenje posle 30
uploada na sat i posle 3 neuspeha nad istim fajlom (`MERENJE_ODBIJENO`).
Prebacivanje memorijskog brojača u tabelu bi dalo tačan broj, ali ne bi
promenilo nijednu od ovih bravi - zato ostaje kao jeftin prigušivač, a
dokumentacija kaže šta on jeste. `lastUsedAt` se osvežava najviše jednom u
minutu po ključu i nikad ne obara zahtev.

**Izmereno na dev deploymentu (2026-09-09, P4b):** 90 sekvencijalnih `ping`
zahteva istim ključem u ~30 s dalo je 88×200 (2 mrežne greške) i **nijedan
429**; 120 zahteva na `/oauth/token` istim `client_id`-jem takođe nijedan.
Modulsko stanje se između uzastopnih `httpAction` poziva na pravom Convex-u
ne zadržava (ili je razvučeno preko toliko izolata da prozor od 60 s ne
napuni nijedan), pa memorijski prigušivači - i ovaj iz P1 i oni iz P4/P4b -
**van testova praktično ne opale**. Testovi (`convex-test`, jedan proces) ih
dokazuju kao logiku; u produkciji pravu granicu drže samo bravi u bazi iz
prethodnog pasusa plus dnevni kap registracija (`oauthClients.by_createdAt`,
koji jeste u bazi). Stvarna zamena je `@convex-dev/rate-limiter` (tabela,
atomično, po ključu/odobrenju) - zahteva novu zavisnost u `package.json`, pa
je odluka za posebnu grupu.

---

## 4. Ceo tok: image-to-video preko MCP-a

Primer sa dev deploymenta (`wandering-fox-41`), model `kling-3`, režim
`image`. Sva tela su JSON-RPC 2.0 poruke na `POST /mcp` sa zaglavljima
`Authorization: Bearer nai_live_...` i `Content-Type: application/json`;
rezultat alata je uvek JSON tekst u `result.content[0].text`.

**0. Ključ sa pisanjem** (jednom, kroz UI ili CLI):

```
npx convex run mcpKeys:createKey '{"name":"Agent","scopes":["mcp:read","mcp:write"]}' --identity '{"subject":"<USERS_ID>|cli","tokenIdentifier":"cli|<USERS_ID>"}'
```

**1. Šta model traži** - `list_models`, pa se iz reda `kling-3` čita
`inputModes: ["text","image"]` i `inputSpec.image: { image: { max: 1, accept: ["image/png","image/jpeg","image/webp"] } }`.

**2. Dozvola i adresa za upload:**

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_upload_url","arguments":{"slot":"image"}}}
```

```json
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"uploadUrl\":\"https://wandering-fox-41.eu-west-1.convex.cloud/api/storage/upload?token=0182...\",\"grantId\":\"xd7fe4g9bgg61tnwem1bx8gsrs8e1ct6\",\"slot\":\"image\",\"accept\":[\"image/png\",\"image/jpeg\",\"image/webp\"],\"maxBytes\":10485760,\"grantExpiresInSeconds\":3600,\"instructions\":\"Pošalji sadržaj fajla HTTP POST zahtevom na uploadUrl: telo su sirovi bajtovi fajla, zaglavlje Content-Type je MIME tip fajla i OBAVEZNO je (slot \\\"image\\\" prima: image/png, image/jpeg, image/webp; najviše 10 MB). Odgovor je JSON {\\\"storageId\\\": \\\"...\\\"}. Zatim pozovi register_upload sa tim storageId-jem, ovim grantId-jem i istim slotom; fajl pogrešnog tipa ili veličine register_upload odbija i briše.\"}"}]}}
```

**3. Sam upload** - fajl ide POST-om na `uploadUrl` (ne na `/mcp`; PUT vraća
405). `Content-Type` je obavezan - `image/png` u ovom primeru:

```
curl -s -X POST "<uploadUrl>" -H "Content-Type: image/png" --data-binary @slika.png
```

```json
{"storageId":"kg2c5640qnbqmayh7zzch6f1xn8e184r"}
```

**4. Prijava fajla** (slot iz koraka 2, `grantId` iz koraka 2, `storageId`
iz koraka 3):

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"register_upload","arguments":{"storageId":"kg2c5640qnbqmayh7zzch6f1xn8e184r","grantId":"xd7fe4g9bgg61tnwem1bx8gsrs8e1ct6","slot":"image"}}}
```

```json
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\"uploadId\":\"wx768p4jg95a7hz3rnx50ztnqs8e1vcb\",\"storageId\":\"kg2c5640qnbqmayh7zzch6f1xn8e184r\",\"slot\":\"image\",\"bytes\":70,\"mimeType\":\"image/png\",\"durationS\":null,\"measured\":false}"}]}}
```

Za video ili zvuk isti poziv vraća i `durationS` (npr. `4.2`) i
`measured: true`; ako merenje ne uspe, `durationS` je `null` a `measureError`
kaže da li da se ponovi (`ZAGLAVLJE_NIJE_PROCITANO`) ili da se fajl izveze
drugačije (`NEPOZNAT_FORMAT`, `VBR_NEPOUZDAN`, `MERENJE_ODBIJENO`).

Fajl koji slot ne prima ne stiže ni do prijave - odbija se i briše (dev,
`audio/mpeg` okačen u slot `image`):

```json
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"Slot \"image\" prima PNG, JPEG, WEBP, a okačen fajl ima drugi tip ili je poslat bez Content-Type zaglavlja. Fajl je obrisan iz skladišta; pozovi create_upload_url ponovo i okači ispravan fajl. (NEISPRAVAN_TIP_FAJLA)"}],"isError":true}}
```

**5. Posao sa ulazom** - TROŠI KREDITE:

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"create_generation","arguments":{"modelSlug":"kling-3","params":{"prompt":"lisica trči kroz sneg, kamera prati","resolution":"720p","duration":"5"},"inputMode":"image","inputs":{"image":["kg2c5640qnbqmayh7zzch6f1xn8e184r"]}}}}
```

```json
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"{\"jobId\":\"w576z8nk9yq98m1p7j9116hb5n8dg0ng\",\"status\":\"reserved\",\"creditCost\":65,\"modelSlug\":\"kling-3\"}"}]}}
```

Neispravan ulaz ne stiže do servera nego vraća uputstvo, npr. bez `inputs`:

```json
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"Model \"kling-3\" u režimu \"image\" traži ulaz tipa image u slotu \"image\". Okači fajl kroz create_upload_url i register_upload, pa prosledi storageId u inputs. (NEPOTPUN_ULAZ)"}],"isError":true}}
```

ili sa režimom koji model nema:

```json
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"Model \"kling-3\" nema ulazni režim \"audio\". Dostupni režimi: text, image. (NEISPRAVAN_REZIM)"}],"isError":true}}
```

Model koji se naplaćuje po trajanju (npr. `stt`, `kling-lipsync`) sa fajlom
kojem `durationS` još nije upisan vraća `MERENJE_NIJE_DOSTUPNO` sa uputstvom
da se `register_upload` ponovi - posao se tada NE šalje i krediti se ne diraju.

**6. Čekanje na rezultat** (do 60 s po pozivu; ponavlja se dok `timedOut`
ne bude `false`):

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"wait_for_job","arguments":{"jobId":"w576z8nk9yq98m1p7j9116hb5n8dg0ng","timeoutSeconds":60}}}
```

Istek budžeta (nije greška):

```json
{"jsonrpc":"2.0","id":6,"result":{"content":[{"type":"text","text":"{\"status\":\"running\",\"jobId\":\"w576z8nk9yq98m1p7j9116hb5n8dg0ng\",\"creditCost\":65,\"timedOut\":true,\"message\":\"Posao je i dalje u stanju \\\"running\\\" posle 60 s. Pozovi wait_for_job ponovo.\"}"}]}}
```

Gotov posao sa sačuvanim izlazom:

```json
{"jsonrpc":"2.0","id":6,"result":{"content":[{"type":"text","text":"{\"status\":\"done\",\"jobId\":\"w576z8nk9yq98m1p7j9116hb5n8dg0ng\",\"creditCost\":65,\"outputs\":{\"outputUrl\":\"https://wandering-fox-41.eu-west-1.convex.cloud/api/storage/8b1d...\",\"posterUrl\":null,\"expiresAt\":1790793263837},\"timedOut\":false}"}]}}
```

Neuspeo ili refundiran posao dolazi sa `error` umesto `outputs`. Nepostojeći
ili tuđi `jobId` daje `isError` „Posao nije pronađen." odmah, bez čekanja.

**7. URL izlaza** (kad god zatreba ponovo, dok izlaz ne istekne):

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_output_url","arguments":{"jobId":"w576z8nk9yq98m1p7j9116hb5n8dg0ng"}}}
```

```json
{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{\"jobId\":\"w576z8nk9yq98m1p7j9116hb5n8dg0ng\",\"kind\":\"video\",\"outputUrl\":\"https://wandering-fox-41.eu-west-1.convex.cloud/api/storage/8b1d...\",\"posterUrl\":null,\"expiresAt\":1790793263837}"}]}}
```

`expiresAt` je trenutak (ms od epohe) kad `crons.expireGenerationFiles` briše
izlaz po retenciji vrste; do tada URL radi bez dodatnog potpisa.

---

## 5. Šta su P3 i P4 doneli i šta ostaje

P3 (MCP-P3-ULAZI): `...ForUser` refaktor upload lanca
(`createInputUploadUrl`, `registerInputUpload`, `measureInputUpload`) sa
internim varijantama po `userId`, četiri nova alata (`create_upload_url`,
`register_upload`, `wait_for_job`, `get_output_url`), `create_generation` sa
`inputMode`/`inputs`/`sourceJobId` i prevodom neispravne narudžbine u
uputstvo pre poziva u Convex, i testovi kapija koje P2 nije pokrio (email,
uslovi, stvarno skidanje kredita, `PREVISE_POSLOVA`).

P3b (MCP-P3b-ULAZNA-KAPIJA): serverska provera tipa i veličine okačenog
fajla pri prijavi - ista logika kao `validateSlotFile` u formi, preseljena u
`convex/studioJobCore.ts` (`slotFileProblem`, `acceptForSlot`,
`MAX_SLOT_BYTES`) i primenjena u `registerInputUploadForUser` nad
metapodacima iz `_storage`; MCP put strog na `Content-Type`, odbijen fajl se
briše iz skladišta; `create_upload_url` vraća `accept` i `maxBytes`.

P4 (MCP-P4-OAUTH): OAuth 2.1 sa PKCE S256 i dinamičkom registracijom klijenta
kao DRUGI način autentikacije na isti `/mcp` (sekcija 6): dva `.well-known`
dokumenta, `/oauth/register`, `/oauth/token`, ekran pristanka
`/oauth/authorize` na Next aplikaciji, tri tabele (`oauthClients`,
`oauthAuthCodes`, `oauthTokens`), druga grana u `handler.ts` koja pravi isti
`principal`, i „Povezane aplikacije" na strani ključeva.

P4b (MCP-P4b-ZATVARANJE-RUPA), posle review-a: zaštita ekrana pristanka od
uokviravanja (clickjacking) kroz `X-Frame-Options`/`frame-ancestors` u
`next.config.ts` (`lib/security-headers.ts`), stabilan subjekt prigušivača za
OAuth (id odobrenja umesto id-ja reda tokena, koji rotacija menja),
prigušivač na `/oauth/token` po `client_id`, prigušivač registracije po IP-u
plus dnevni kap na nove klijente, čitanje tela po `content-length` pre
parsiranja, čišćenje bidi/nevidljivih/kombinujućih znakova iz imena
klijenta, pun `redirect_uri` na ekranu pristanka, i cron koji briše istekle
kodove i tokene. Detalji u sekciji 6, „Pravila".

Ostaje za kasnije: rate limit u tabeli (ili `@convex-dev/rate-limiter`) ako
tačan broj po ključu ikad postane važan (danas nije - vidi sekciju 3); izbor
manjeg opsega na ekranu pristanka (danas je „sve ili ništa" prema onome što
klijent traži); Client ID Metadata Documents (MCP spec ih preporučuje, Claude
klijenti danas koriste dinamičku registraciju). Nije planirano: `resources/` i
`prompts/` MCP primitivi, javna registracija servera.

---

## 6. OAuth 2.1: pristup bez ručnog ključa (P4)

Tok po MCP specifikaciji (2025-11-25, sekcija Authorization): OAuth 2.1 sa
PKCE, RFC 9728 (Protected Resource Metadata), RFC 8414 (Authorization Server
Metadata), RFC 7591 (Dynamic Client Registration), RFC 8707 (`resource`).
Autorizacioni server I zaštićeni resurs su Convex site (`CONVEX_SITE_URL`);
**ekran pristanka je Next stranica** na `SITE_URL` (`/oauth/authorize`), jer
tamo živi Convex Auth sesija - convex.site nema kolačić. RFC 8414 dozvoljava da
`authorization_endpoint` bude na drugom hostu od `issuer`-a.

### Endpointi

| Šta | Gde | Metoda |
| --- | --- | --- |
| metapodaci zaštićenog resursa (RFC 9728) | `<site>/.well-known/oauth-protected-resource` i `<site>/.well-known/oauth-protected-resource/mcp` (isti dokument, klijent proba oba) | GET |
| metapodaci autorizacionog servera (RFC 8414) | `<site>/.well-known/oauth-authorization-server` | GET |
| registracija klijenta (RFC 7591) | `<site>/oauth/register` | POST JSON |
| ekran pristanka | `<app>/oauth/authorize` (sr) / `<app>/en/oauth/authorize` | GET (browser) |
| token | `<site>/oauth/token` | POST form (JSON se toleriše) |

`<site>` = `https://quick-yak-270.eu-west-1.convex.site` (prod) /
`https://wandering-fox-41.eu-west-1.convex.site` (dev); `<app>` = `SITE_URL`
Convex env promenljive (`https://nauciai.com` / `http://localhost:3000`).
Svi endpointi nose CORS `*` i OPTIONS preflight. Convex Auth već drži
`/.well-known/openid-configuration` (za sopstvene JWT-ove) - ne dira se; MCP
klijent prvo traži `oauth-authorization-server` i tu staje.

### Tok

1. Klijent pošalje `POST /mcp` bez tokena -> **401** sa `WWW-Authenticate:
   Bearer resource_metadata="<site>/.well-known/oauth-protected-resource",
   scope="mcp:read mcp:write"`.
2. Klijent skine metapodatke resursa (`authorization_servers: ["<site>"]`), pa
   AS metapodatke (`authorization_endpoint`, `token_endpoint`,
   `registration_endpoint`, `code_challenge_methods_supported: ["S256"]`).
3. `POST /oauth/register` sa `client_name` i `redirect_uris` -> `client_id`
   (= `_id` reda u `oauthClients`; javni klijent, bez tajne). Bez ručnog
   unosa client_id-ja.
4. Browser na `<app>/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&scope=mcp:read%20mcp:write&state=...&code_challenge=...&code_challenge_method=S256&resource=<site>/mcp`.
   Neprijavljen korisnik ide na `/sign-in?next=<isti URL sa svim parametrima>`
   i posle prijave se vraća na isti zahtev (`/auth/complete` ne šalje OAuth
   povratak u onboarding korisničkog imena). Prijavljen vidi ime klijenta,
   host na koji se vraća, ko je prijavljen, i tačno tražene opsege; `mcp:write`
   nosi upozorenje da troši kredite. „Dozvoli pristup" -> server izdaje kod i
   preusmerava na `redirect_uri?code=...&state=...`; „Odbij" ->
   `redirect_uri?error=access_denied&state=...`.
5. `POST /oauth/token` (`grant_type=authorization_code`, `code`,
   `redirect_uri`, `client_id`, `code_verifier`, `resource`) ->
   `{access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope}`.
6. `POST /mcp` sa `Authorization: Bearer nai_oat_...` - isti alati, isti
   opsezi, isti rate limit kao ključ. `whoami` vraća `keyName` = ime klijenta.
7. Posle sat vremena access token ističe (401) i klijent zove
   `grant_type=refresh_token` -> nov par (stari refresh token se rotira).

### Pravila (tačka 3 brifa)

- PKCE **S256 obavezan**; `plain` ili odsutan `code_challenge_method` ->
  `invalid_request`. `code_verifier` obavezan na token endpointu; pogrešan ->
  `invalid_grant`.
- `redirect_uri` mora da se poklopi **znak-za-znak** sa registrovanim; bez
  wildcard-a. Pri registraciji sme `https://` bilo gde ili `http://` samo na
  `localhost` / `127.0.0.1` / `[::1]` (Claude Code, mcp-remote), bez fragmenta.
  Nepoznat klijent ili neregistrovan URI -> ekran pristanka pokazuje grešku i
  **ne preusmerava nikud**; ostale greške (PKCE, opseg, `resource`) idu nazad na
  registrovani URI sa `error` i nepromenjenim `state`.
- Authorization code: `nai_oac_` + 43 base62, važi **60 s**, koristi se
  **tačno jednom**, vezan za `client_id`, `redirect_uri` i `code_challenge`.
  Ponovna upotreba -> `invalid_grant` **i odmah se opozivaju svi tokeni tog
  koda** (`oauthTokens.by_code`).
- Access token `nai_oat_` + 43 base62, **1 h**; refresh token `nai_ort_` + 43
  base62, **30 dana** (klizno - svaka rotacija daje novih 30). Rotacija: stari
  red se opoziva, nov nasleđuje `codeId`; replay već rotiranog refresh tokena
  gasi celu porodicu. Opoziv iz UI-ja gasi sve redove korisnika za taj klijent.
- `state` se vraća nepromenjen (`URLSearchParams`, bez tumačenja).
- `resource` (RFC 8707), ako je poslat, mora da bude `<site>/mcp` (shema i host
  bez obzira na velika slova, završna kosa crta tolerisana) - inače
  `invalid_target`. Bez `CONVEX_SITE_URL`-a odbija se, ne preskače.
- `scope` bez parametra = samo `mcp:read`; nepoznat opseg -> `invalid_scope`.
  Klijent koji prati spec traži `scopes_supported` iz metapodataka (oba), pa
  ekran pristanka upozorava na kredite.
- Tokeni, kodovi i `code_verifier` se **nikad ne loguju**: HTTP sloj ih hešuje
  (`sha256`; verifier -> S256 izazov) i Convex funkcije primaju samo heš, kao i
  `mcpKeys.resolveKey`. Baza čuva samo heševe. Poređenje heševa je
  `timingSafeEqual` iz `mcp/apiKey.ts`.
- Registracija je javna: `client_name` obavezan (1-128 znakova), 1-10 URI-ja,
  samo `token_endpoint_auth_method: none`. Ime ide u `<h1>` ekrana pristanka i
  glavni je anti-phishing signal, pa se (P4b) posle NFC normalizacije čiste
  kontrolni znakovi, bidi kontrole (npr. U+202E koji okreće tekst), nevidljivi
  i zero-width znakovi, tag znakovi i „generički" kombinujući dijakritici
  (Zalgo); ime od samih nevidljivih znakova pada kao prazno
  (`sanitizeClientName` u `core.ts`).
- Prigušivači (P4b) - svi u memoriji izolata, kao MCP rate limit (i sa istim
  ograničenjem: na pravom deploymentu se ne opale, vidi sekciju 3 „Rate
  limit"; jedina brana u bazi je dnevni kap ispod): registracija **20/min po
  IP-u** (`cf-connecting-ip`, pa poslednji unos `x-forwarded-for`; Convex
  prosleđuje oba - provereno na dev-u) plus **globalni kap 500 novih
  klijenata dnevno** (`oauthClients.by_createdAt`, 429 `too_many_requests` sa
  `Retry-After: 3600`); token endpoint **30/min po `client_id`**. Na `/mcp`
  OAuth token deli iste prigušivače kao ključ, a
  **subjekt je id ODOBRENJA** (`oauthAuthCodes._id`, u principalu i dalje
  polje `keyId`), ne id reda tokena: rotacija refresh tokena upisuje nov red
  i sa njegovim `_id`-jem bi svaka rotacija donosila prazne brojače. Odobrenje
  preživljava rotaciju, a nov subjekt traži nov pristanak u browseru - ista
  klasa troška kao pravljenje novog API ključa (`flow.test.ts`: „rotacija
  refresh tokena NE resetuje rate limit").
- Telo `/oauth/register` i `/oauth/token` je ograničeno na 16 KB: prvo se
  gleda `content-length`, pa stvarna veličina, tek onda parsiranje (413) -
  isti obrazac kao `/mcp` handler (P4b).
- Ekran pristanka ne sme u tuđi `<iframe>` (P4b, clickjacking): `next.config.ts`
  daje `X-Frame-Options: DENY` i `Content-Security-Policy: frame-ancestors
  'none'` za `/oauth/*`, `/app/*` (i strana ključeva), `/studio/app`,
  `/studio/krediti`, `/sign-in`, `/auth/*`, `/reset-password`,
  `/verify-email`, u sve tri jezičke forme (javna, `/en`, interna `/sr`).
  Spisak i obrazloženje su u `lib/security-headers.ts`;
  `lib/security-headers.test.ts` proverava pravila istim matcher-om koji Next
  koristi za `headers()`. Ekran uz to prikazuje PUN `redirect_uri`, ne samo
  host - korisnik vidi tačno kuda ga vraćaju.
- Čišćenje (P4b): cron `oauth: ciscenje isteklih tokena` (04:20 UTC,
  `oauth/server.ts` -> `cleanupExpired`) briše redove `oauthTokens` čiji je
  refresh istekao ili su opozvani (rotacija, opoziv, gašenje porodice) pre
  više od 24 h, kod čim ode poslednji red njegove porodice, i nikad razmenjene
  kodove dan posle isteka; 200 po prolazu, pun prolaz se odmah zakazuje
  ponovo. Razmenjen kod sa živom porodicom ostaje (nosi `connectedAt` u UI-ju).

### Greške token endpointa

| Situacija | HTTP | `error` |
| --- | --- | --- |
| telo nije form/JSON, nema `client_id`, nema/loš `code_verifier`, nema `redirect_uri` | 400 | `invalid_request` |
| nepoznat `client_id` | 401 | `invalid_client` |
| kod nepostojeći/istekao/iskorišćen/tuđ, `redirect_uri` ne poklapa, PKCE ne poklapa, refresh nepostojeći/istekao/opozvan | 400 | `invalid_grant` (uvek ista poruka) |
| `resource` nije ovaj server | 400 | `invalid_target` |
| drugi `grant_type` | 400 | `unsupported_grant_type` |
| telo veće od 16 KB (po `content-length` ili stvarno) | 413 | `invalid_request` (`invalid_client_metadata` na registraciji) |
| više od 30 zahteva/min za isti `client_id` (registracija: 20/min po IP-u, ili dnevni kap) | 429 + `Retry-After` | `too_many_requests` |

### Provera na dev deploymentu (2026-09-09, `npx convex dev --once`)

`GET /.well-known/oauth-protected-resource` (isti odgovor i na `/mcp` sufiksu):

```json
{"resource":"https://wandering-fox-41.eu-west-1.convex.site/mcp","authorization_servers":["https://wandering-fox-41.eu-west-1.convex.site"],"scopes_supported":["mcp:read","mcp:write"],"bearer_methods_supported":["header"],"resource_name":"Nauci AI MCP"}
```

`GET /.well-known/oauth-authorization-server` (dev `SITE_URL` je
`http://localhost:3000`, na produ `https://nauciai.com`):

```json
{"issuer":"https://wandering-fox-41.eu-west-1.convex.site","authorization_endpoint":"http://localhost:3000/oauth/authorize","token_endpoint":"https://wandering-fox-41.eu-west-1.convex.site/oauth/token","registration_endpoint":"https://wandering-fox-41.eu-west-1.convex.site/oauth/register","response_types_supported":["code"],"grant_types_supported":["authorization_code","refresh_token"],"code_challenge_methods_supported":["S256"],"token_endpoint_auth_methods_supported":["none"],"scopes_supported":["mcp:read","mcp:write"]}
```

`POST /oauth/register` -> `201 Created`, `Cache-Control: no-store`:

```json
{"client_id":"yn7cag8r6mrxh468tj14yyj1s98e0m8g","client_name":"Claude Desktop (curl proba)","redirect_uris":["https://claude.ai/api/mcp/auth_callback","http://localhost:6274/callback"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none","client_id_issued_at":1788908023}
```

`POST /mcp` bez tokena -> `401`:

```
www-authenticate: Bearer realm="nauciai-mcp", resource_metadata="https://wandering-fox-41.eu-west-1.convex.site/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"

{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Unauthorized"}}
```

Frame zaglavlja na Next dev serveru (P4b, `curl -sI`): `/oauth/authorize`,
`/en/oauth/authorize`, `/sign-in`, `/studio/app` (200) i `/app/profile/api-keys`
(307 na prijavu) nose `X-Frame-Options: DENY` i
`Content-Security-Policy: frame-ancestors 'none'`; `/` i `/kursevi` ih nemaju.

Registracija sa U+202E (RLO) i U+200B (ZWSP) u imenu na dev-u (P4b) vraća
`"client_name":"Claude Desktop (P4b proba 2)"` - oba znaka su izbačena.

Ručna razmena (posle odobrenja u browseru, `code` iz URL-a povratka):

```
curl -s https://wandering-fox-41.eu-west-1.convex.site/oauth/token -d "grant_type=authorization_code&client_id=<client_id>&code=<code>&redirect_uri=<redirect_uri>&code_verifier=<verifier>&resource=https://wandering-fox-41.eu-west-1.convex.site/mcp"
```

Testovi: `convex/oauth/core.test.ts` (čisto jezgro, PKCE vektor iz RFC 7636,
povratak na prijavu sa istim parametrima) i `convex/oauth/flow.test.ts` (ceo
tok kroz `t.fetch`: metapodaci, registracija, pristanak, razmena, jednokratnost
koda sa opozivom, istek 61 s, refresh rotacija i replay, opoziv iz UI-ja, isti
`principal` kao ključ, regresija Bearer puta).
