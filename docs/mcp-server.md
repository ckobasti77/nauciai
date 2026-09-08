# Nauci AI MCP server (P3 - ulazi, čekanje, izlaz)

MCP (Model Context Protocol) server platforme živi na Convex HTTP ruteru, po
istoj arhitekturi kao Higgsfield MCP: **Streamable HTTP** transport na putanji
`/mcp`, **JSON-RPC 2.0**, **Bearer** autentikacija API ključem. P1 je dokazao
transport jednim trivijalnim alatom (`whoami`); P2 (MCP-P2-STUDIO) je dodao
šest studio alata, opseg `mcp:write` i UI stranu za ključeve; P3 (MCP-P3-ULAZI)
dodaje okačivanje fajlova (`create_upload_url`, `register_upload`), poslove sa
ulazom (`create_generation` sa `inputMode`/`inputs`/`sourceJobId`), čekanje na
rezultat (`wait_for_job`) i potpisan URL izlaza (`get_output_url`).

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
  odgovoru.
- `OPTIONS /mcp` - CORS preflight (`*`; `Authorization`, `Content-Type`,
  `Mcp-Session-Id`, `Mcp-Protocol-Version`).
- `GET /mcp` - 405 (nema server-strane SSE struje).

Greške:

| Situacija | HTTP | JSON-RPC kod |
| --- | --- | --- |
| bez/neispravno/nepostojeće/revokovano Bearer zaglavlje | 401 | -32001 (uvek ista poruka, bez razloga) |
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

## 5. Šta je P3 doneo i šta ostaje

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

Ostaje za kasnije: rate limit u tabeli (ili `@convex-dev/rate-limiter`) ako
tačan broj po ključu ikad postane važan (danas nije - vidi sekciju 3). Nije
planirano: OAuth (ostaje Bearer), `resources/` i `prompts/` MCP primitivi.
