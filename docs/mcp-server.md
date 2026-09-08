# Nauci AI MCP server (P1 - skelet)

MCP (Model Context Protocol) server platforme živi na Convex HTTP ruteru, po
istoj arhitekturi kao Higgsfield MCP: **Streamable HTTP** transport na putanji
`/mcp`, **JSON-RPC 2.0**, **Bearer** autentikacija API ključem. P1 ne izlaže
nijedan studio alat - izlaže tačno jedan trivijalan alat (`whoami`) da se
transport dokaže kraj-do-kraja.

| Okruženje | URL servera |
| --- | --- |
| prod | `https://quick-yak-270.eu-west-1.convex.site/mcp` |
| dev | `https://wandering-fox-41.eu-west-1.convex.site/mcp` |

Kod: `convex/mcp/` (transport, protokol, registar alata, rate limit, ključ),
`convex/mcpKeys.ts` (Convex funkcije za ključeve), rute u `convex/http.ts`,
tabela `mcpApiKeys` u `convex/schema.ts`.

---

## 1. Kako se dobija ključ

Ključ ima oblik `nai_live_` + 43 base62 znaka (32 nasumična bajta). U bazi
stoji **samo sha256 heš** i prvih 12 znakova za prikaz; pun ključ se vraća
**tačno jednom**, pri kreiranju. Ako se izgubi, pravi se nov.

P1 nema UI stranicu za ključeve (to je P2), pa se ključ pravi preko Convex
CLI-ja **kao prijavljeni korisnik**. Potreban je `_id` korisnika iz tabele
`users` (Convex dashboard -> Data -> users). Convex Auth čita korisnika iz
`subject` polja identiteta (deo pre `|`), pa se on prosleđuje `--identity`
zastavicom.

PowerShell, dev deployment:

```
npx convex run mcpKeys:createKey '{"name":"Claude Desktop"}' --identity '{"subject":"<USERS_ID>|cli","tokenIdentifier":"cli|<USERS_ID>"}'
```

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

Opsezi: P1 daje svakom ključu `["mcp:read"]`.

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
razgovoru alat `whoami` vraća id i email korisnika.

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

## 3. Šta P1 podržava

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

Alati:

| Alat | Ulaz | Izlaz | Opseg |
| --- | --- | --- | --- |
| `whoami` | nema | `{userId, email, keyName, scopes}` | `mcp:read` |

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
| telo veće od 1 MB | 413 | -32003 |
| loš JSON | 400 | -32700 |
| neispravan JSON-RPC zahtev | 400 | -32600 |
| nepoznata metoda ili nepoznat alat | 200 | -32601 |
| neispravni parametri | 200 | -32602 |
| neočekivana greška (nikad stack trace) | 200 / 500 | -32603 |

Rate limit u P1 je u memoriji izolata (`convex/mcp/rateLimit.ts`), pa je
stvarna granica labava kad Convex podigne više izolata; interfejs je
zamenljiv i P2 ga vodi u tabelu. `lastUsedAt` se osvežava najviše jednom u
minutu po ključu i nikad ne obara zahtev.

---

## 4. Šta dolazi u P2

- Studio alati: pokretanje generisanja (`generationJobs`), status posla,
  projekti (`studioProjects`), krediti - svaki sa svojim opsegom
  (`studio:read`, `studio:write`), registrovan kao nov unos u
  `convex/mcp/tools.ts`.
- UI stranica za ključeve (kreiranje, prikaz prefiksa, revokacija) umesto
  CLI-ja.
- Rate limit u tabeli (ili `@convex-dev/rate-limiter`) umesto memorije.

Nije planirano ni u P2: OAuth (ostaje Bearer), `resources/` i `prompts/` MCP
primitivi.
