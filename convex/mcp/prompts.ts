/**
 * MCP promptovi (MCP-P5-PRIMITIVI, tačka 3): gotovi šabloni koje korisnik
 * bira iz menija u Claude Desktopu. Tačno tri, na srpskom - vidi ih vlasnik
 * ključa, ne posetilac sajta. Oblici su iz MCP spec-a (server/prompts):
 * `prompts/list` -> `{ prompts: [{ name, title, description, arguments }] }`,
 * `prompts/get` -> `{ description, messages: [{ role, content }] }`.
 *
 * Promptovi ne čitaju ništa iz baze i ne traže opseg: tekst upućuje model na
 * resurse i alate, a tek TI proveravaju opseg i vlasništvo. Nepoznato ime i
 * nedostajući obavezan argument su -32602, po spec-u.
 */

import { JSON_RPC_ERROR, McpError, type PromptDescriptor, type PromptGetResult, type PromptProvider } from "./protocol";

const DEFAULT_JOBS_COUNT = 10;
const MAX_JOBS_COUNT = 50;

type PromptDefinition = PromptDescriptor & {
  /** Argumenti su već provereni: obavezni postoje, svi su stringovi. */
  build: (args: Record<string, string>) => PromptGetResult;
};

function userMessage(description: string, text: string): PromptGetResult {
  return { description, messages: [{ role: "user", content: { type: "text", text } }] };
}

function invalidParams(message: string): McpError {
  return new McpError(JSON_RPC_ERROR.INVALID_PARAMS, `Invalid params: ${message}`);
}

const PROMPTS: PromptDefinition[] = [
  {
    name: "napravi-sliku",
    title: "Napravi sliku",
    description: "Od opisa do gotove slike: izbor image modela iz kataloga, provera kredita, pa create_generation.",
    arguments: [
      { name: "opis", description: "Šta treba da bude na slici.", required: true },
      { name: "stil", description: "Željeni stil (npr. fotorealistično, akvarel, 3D render). Opciono.", required: false },
    ],
    build: ({ opis, stil }) =>
      userMessage(
        "Generisanje slike u Nauči AI Studiju",
        [
          `Napravi sliku po ovom opisu: ${opis}`,
          stil ? `Željeni stil: ${stil}` : null,
          "",
          "Uradi redom:",
          "1. Pročitaj resurs nauciai://models i izaberi model sa kind \"image\" koji najbolje odgovara opisu i stilu. Iz njegovog paramSpec-a vidi koje parametre prima i koje vrednosti su dozvoljene; resurs nauciai://models/{slug} daje primer params objekta koji prolazi validaciju.",
          "2. Pročitaj resurs nauciai://credits i proveri da saldo pokriva cenu po priceRule-u modela i da je Studio dostupan (hasStudioAccess). Ako nešto ne prolazi, reci mi to i stani - ne pozivaj alat.",
          "3. Pozovi create_generation sa modelSlug i params (prompt na engleskom, precizan, sa stilom; ostali parametri po paramSpec-u). Alat troši kredite, pa ga pozovi tačno jednom.",
          "4. Pozovi wait_for_job dok status ne bude završan, pa mi daj outputUrl i koliko je kredita potrošeno.",
        ]
          .filter((line) => line !== null)
          .join("\n"),
      ),
  },
  {
    name: "slika-u-video",
    title: "Slika u video",
    description:
      "Ceo tok image-to-video: okačivanje slike (create_upload_url, POST fajla, register_upload), create_generation sa inputs, wait_for_job, get_output_url.",
    arguments: [{ name: "opis pokreta", description: "Šta se dešava u videu: kako se scena i kamera pokreću.", required: true }],
    build: (args) =>
      userMessage(
        "Video iz slike u Nauči AI Studiju",
        [
          `Napravi video iz slike koju ću ti dati. Opis pokreta: ${args["opis pokreta"]}`,
          "",
          "Uradi redom, ne preskači korake:",
          "1. Pročitaj resurs nauciai://models i izaberi model sa kind \"video\" čiji inputModes sadrži \"image\". Iz inputSpec-a za režim \"image\" pročitaj slot (obično \"image\") i koje tipove fajla prima.",
          "2. Pročitaj nauciai://credits i proveri saldo i pristup. Ako ne prolazi, reci mi i stani.",
          "3. Pozovi create_upload_url sa tim slotom. Dobijaš uploadUrl i grantId.",
          "4. Pošalji sliku HTTP POST zahtevom na uploadUrl: telo su sirovi bajtovi fajla, zaglavlje Content-Type je MIME tip slike i obavezno je. Odgovor je JSON sa storageId.",
          "5. Pozovi register_upload sa storageId, grantId i istim slotom.",
          "6. Pozovi create_generation sa modelSlug, inputMode \"image\", inputs { \"<slot>\": [\"<storageId>\"] } i params po paramSpec-u modela (prompt je opis pokreta na engleskom). Alat troši kredite - tačno jedan poziv.",
          "7. Pozivaj wait_for_job dok timedOut ne bude false.",
          "8. Pozovi get_output_url i daj mi outputUrl, posterUrl ako postoji, i do kada izlaz važi (expiresAt).",
          "",
          "Ako nemaš način da pošalješ fajl HTTP zahtevom, reci mi to pre koraka 3 i ne pozivaj alate za pisanje.",
        ].join("\n"),
      ),
  },
  {
    name: "pregled-poslova",
    title: "Pregled poslova",
    description: "Sažetak poslednjih generacija: stanja, modeli, potrošeni krediti.",
    arguments: [
      {
        name: "koliko",
        description: `Koliko poslednjih poslova da se pregleda (1-${MAX_JOBS_COUNT}, podrazumevano ${DEFAULT_JOBS_COUNT}).`,
        required: false,
      },
    ],
    build: ({ koliko }) => {
      // Prazan opcioni argument (klijent pošalje "" za nepopunjeno polje) = odsutan.
      const count = koliko === undefined || koliko.trim() === "" ? DEFAULT_JOBS_COUNT : Number(koliko);
      if (!Number.isInteger(count) || count < 1 || count > MAX_JOBS_COUNT) {
        throw invalidParams(`\`koliko\` must be an integer between 1 and ${MAX_JOBS_COUNT}`);
      }

      return userMessage(
        "Pregled poslednjih poslova u Nauči AI Studiju",
        [
          `Pozovi list_my_jobs sa limit ${count} i napravi mi sažetak:`,
          "- koliko poslova je u kom stanju (done, running, reserved, failed, refunded),",
          "- koji modeli su korišćeni i koliko puta,",
          "- ukupno potrošenih kredita (zbir creditCost poslova koji nisu refunded),",
          "- za neuspele poslove kratko šta piše u error.",
          "Na kraju, ako je nešto još u toku, ponudi da sačekaš kroz wait_for_job.",
        ].join("\n"),
      );
    },
  },
];

export const PROMPT_NAMES = PROMPTS.map((prompt) => prompt.name);

export const promptProvider: PromptProvider = {
  list: () =>
    PROMPTS.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })),
  get: async (name, args) => {
    const prompt = PROMPTS.find((candidate) => candidate.name === name);
    if (!prompt) throw invalidParams(`unknown prompt "${name}"`);
    for (const argument of prompt.arguments ?? []) {
      if (argument.required && !(args[argument.name] ?? "").trim()) {
        throw invalidParams(`argument \`${argument.name}\` is required`);
      }
    }

    return prompt.build(args);
  },
};
