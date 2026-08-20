import { expect, test } from "vitest";

import {
  lowerBoundSeconds,
  MAX_PLAUSIBLE_BITRATE_BPS,
  MEASURABLE_MIME,
  MIN_PLAUSIBLE_BITRATE_BPS,
  readMediaDuration,
  upperBoundSeconds,
} from "./media-duration";

/** Bajtovi iz ASCII niza - imena kutija i komada su uvek ASCII. */
function tag(text: string): number[] {
  return [...text].map((letter) => letter.charCodeAt(0));
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function bytes(...parts: Array<number[] | Uint8Array>): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

// ── sintetička zaglavlja ───────────────────────────────────────────────────

/**
 * `mvhd` kutija sa zadatim `timescale`-om i trajanjem. Verzija 0 nosi 32-bitne
 * brojeve, verzija 1 64-bitne - oba oblika postoje u divljini, pa se oba prave.
 */
function mvhd(timescale: number, duration: number, version: 0 | 1 = 0): number[] {
  const times =
    version === 0
      ? [...u32be(0), ...u32be(0), ...u32be(timescale), ...u32be(duration)]
      : [
          ...u32be(0),
          ...u32be(0),
          ...u32be(0),
          ...u32be(0),
          ...u32be(timescale),
          ...u32be(0),
          ...u32be(duration),
        ];
  const size = version === 0 ? 108 : 120;

  // Rep kutije (rate, volume, matrica, next_track_ID) je fiksne dužine i ne
  // nosi ništa što nam treba - popunjava se nulama do pune veličine.
  const tail = new Array(size - 8 - 4 - times.length).fill(0);

  return [...u32be(size), ...tag("mvhd"), version, 0, 0, 0, ...times, ...tail];
}

function ftyp(): number[] {
  return [...u32be(16), ...tag("ftyp"), ...tag("isom"), ...u32be(512)];
}

/** MP4 sa `moov`-om na početku - ono što daje `-movflags faststart`. */
function mp4(timescale: number, duration: number, version: 0 | 1 = 0): Uint8Array {
  const atom = mvhd(timescale, duration, version);

  return bytes(ftyp(), u32be(atom.length + 8), tag("moov"), atom);
}

/** WAV sa jednim `fmt ` i jednim `data` komadom. */
function wav(byteRate: number, dataSize: number): Uint8Array {
  return bytes(
    tag("RIFF"),
    u32le(dataSize + 36),
    tag("WAVE"),
    tag("fmt "),
    u32le(16),
    u16le(1),
    u16le(2),
    u32le(44100),
    u32le(byteRate),
    u16le(4),
    u16le(16),
    tag("data"),
    u32le(dataSize),
  );
}

/** MPEG 1 Layer III, 128 kbps, 44,1 kHz, stereo. */
const MP3_FRAME = [0xff, 0xfb, 0x90, 0x00];

/** Tarife MPEG 1 Layer III po indeksu iz zaglavlja frejma, u kbps. */
const MP3_V1_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

/**
 * CEO frejm zadate tarife: zaglavlje plus telo do pune dužine, po istoj
 * formuli po kojoj parser šeta (`144 * kbps / 44,1 kHz`). Bez tačne dužine
 * šetnja bi promašila sledeće zaglavlje i stala na prvom frejmu - dakle na
 * ponašanju koje ovaj korak baš popravlja.
 */
function mp3FrameAt(kbps: number): number[] {
  const index = MP3_V1_KBPS.indexOf(kbps);
  const length = Math.floor((144 * kbps * 1000) / 44_100);

  return [0xff, 0xfb, index << 4, 0x00, ...new Array(length - 4).fill(0x55)];
}

function mp3Xing(frames: number): Uint8Array {
  return bytes(
    MP3_FRAME,
    new Array(32).fill(0),
    tag("Xing"),
    u32be(1),
    u32be(frames),
    new Array(64).fill(0),
  );
}

/** EBML element: ID se piše kakav jeste, veličina kao jednobajtni vint. */
function ebml(id: number[], body: number[]): number[] {
  return [...id, 0x80 | body.length, ...body];
}

function float64(value: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);

  return [...new Uint8Array(view.buffer)];
}

function webm(ticks: number, scale = 1_000_000): Uint8Array {
  const info = ebml(
    [0x15, 0x49, 0xa9, 0x66],
    [
      ...ebml([0x2a, 0xd7, 0xb1], u32be(scale).slice(1)),
      ...ebml([0x44, 0x89], float64(ticks)),
    ],
  );

  return bytes(
    ebml([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x86, 0x81, 0x01]),
    // `Segment` sa nepoznatom veličinom (0xFF) - tako ga piše svaki enkoder
    // koji ne zna unapred koliko će fajl biti dugačak.
    [0x18, 0x53, 0x80, 0x67, 0xff],
    info,
  );
}

// ── MP4 ────────────────────────────────────────────────────────────────────

test("MP4 sa poznatim `mvhd`-om daje tačno trajanje", () => {
  // 1 000 otkucaja u sekundi, 12 400 otkucaja = 12,4 s.
  const file = mp4(1000, 12_400);

  expect(readMediaDuration(file, file.length)).toEqual({
    ok: true,
    format: "mp4",
    seconds: 12.4,
  });
});

test("`mvhd` verzije 1 se čita isto, iz 64-bitnog trajanja", () => {
  const file = mp4(90_000, 90_000 * 7, 1);

  expect(readMediaDuration(file, file.length)).toEqual({ ok: true, format: "mp4", seconds: 7 });
});

test("`moov` na KRAJU fajla se nalazi i kad opseg ne počinje na granici kutije", () => {
  const whole = bytes(
    ftyp(),
    u32be(1024),
    tag("mdat"),
    new Array(1016).fill(0x41),
    u32be(mvhd(600, 3000).length + 8),
    tag("moov"),
    mvhd(600, 3000),
  );
  // Isečen rep, kao što ga akcija čita `Range` zahtevom - bez `ftyp`-a i bez
  // ijedne cele kutije ispred `moov`-a.
  const tail = whole.slice(whole.length - 200);

  expect(readMediaDuration(tail, whole.length)).toEqual({ ok: true, format: "mp4", seconds: 5 });
});

test("MP4 bez `moov`-a u opsegu se odbija, ali se prepoznaje kao MP4", () => {
  const head = bytes(ftyp(), u32be(1024), tag("mdat"), new Array(200).fill(0));

  // Format je poznat, trajanje nije - pozivalac po tome zna da proba rep.
  expect(readMediaDuration(head, 10_000)).toEqual({
    ok: false,
    format: "mp4",
    reason: "ZAGLAVLJE_NIJE_PROCITANO",
  });
});

test("fajl kraći od `mvhd` zaglavlja se odbija umesto da se čita preko kraja", () => {
  const full = mp4(1000, 12_400);
  // Presečeno usred `mvhd` tela: ime kutije je tu, `timescale` i trajanje nisu.
  const cut = full.slice(0, full.length - 90);

  expect(readMediaDuration(cut, full.length)).toEqual({
    ok: false,
    format: "mp4",
    reason: "ZAGLAVLJE_NIJE_PROCITANO",
  });
});

test("`mvhd` bez trajanja se odbija, ne prijavljuje se nula sekundi", () => {
  const unknown = mp4(1000, 0xffffffff);
  const zero = mp4(1000, 0);

  expect(readMediaDuration(unknown, unknown.length)).toMatchObject({ ok: false, format: "mp4" });
  expect(readMediaDuration(zero, zero.length)).toMatchObject({ ok: false, format: "mp4" });
});

// ── WAV ────────────────────────────────────────────────────────────────────

test("WAV daje trajanje iz odnosa `data` veličine i `byteRate`-a", () => {
  // 44,1 kHz, 16 bita, stereo = 176 400 B/s; 529 200 B = tačno 3 s.
  const file = wav(176_400, 529_200);

  expect(readMediaDuration(file, file.length)).toEqual({ ok: true, format: "wav", seconds: 3 });
});

test("WAV sa komadom pre `fmt `-a se i dalje čita", () => {
  const file = wav(176_400, 88_200);
  // `LIST` komad se ubacuje izmedju `WAVE` i `fmt ` - obilazak komada mora da
  // ga preskoči, a ne da stane na prvom nepoznatom imenu.
  const withList = bytes(
    file.slice(0, 12),
    tag("LIST"),
    u32le(4),
    tag("INFO"),
    file.slice(12),
  );

  expect(readMediaDuration(withList, withList.length)).toEqual({
    ok: true,
    format: "wav",
    seconds: 0.5,
  });
});

test("WAV bez `data` komada u opsegu se odbija", () => {
  const file = wav(176_400, 529_200).slice(0, 36);

  expect(readMediaDuration(file, file.length)).toEqual({
    ok: false,
    format: "wav",
    reason: "ZAGLAVLJE_NIJE_PROCITANO",
  });
});

// ── MP3 ────────────────────────────────────────────────────────────────────

test("MP3 sa Xing zaglavljem daje trajanje iz broja frejmova", () => {
  const file = mp3Xing(1000);

  // 1 000 frejmova x 1 152 uzoraka / 44 100 Hz.
  expect(readMediaDuration(file, file.length)).toMatchObject({ ok: true, format: "mp3" });
  expect((readMediaDuration(file, file.length) as { seconds: number }).seconds).toBeCloseTo(
    26.122,
    3,
  );
});

test("MP3 sa ID3 tagom pre zvuka se čita, tag se preskoči", () => {
  const audio = mp3Xing(500);
  // ID3v2 zaglavlje: veličina se piše sedmobitnim bajtovima (0x02 = 2 bajta).
  const file = bytes(tag("ID3"), [3, 0, 0], [0, 0, 0, 2], [0xaa, 0xbb], audio);

  expect((readMediaDuration(file, file.length) as { seconds: number }).seconds).toBeCloseTo(
    13.061,
    3,
  );
});

test("MP3 bez Xing-a se procenjuje iz bitrate-a prvog frejma i veličine fajla", () => {
  const file = bytes(MP3_FRAME, new Array(200).fill(0x55));

  // 128 kbps: 160 000 bajtova je tačno 10 s, ma koliko od njih pročitali.
  expect(readMediaDuration(file, 160_000)).toEqual({ ok: true, format: "mp3", seconds: 10 });
});

test("MP3 bez Xing-a se procenjuje iz PROSEKA prošetanih frejmova, ne iz prvog", () => {
  // Isti fajl kroz tri frejma iste tarife daje isti broj kao i kroz jedan -
  // šetnja ne sme da pomeri CBR slučaj.
  const cbr = bytes(mp3FrameAt(128), mp3FrameAt(128), mp3FrameAt(128));
  expect(readMediaDuration(cbr, 160_000)).toEqual({ ok: true, format: "mp3", seconds: 10 });

  // 128 i 160 kbps: raspon je 1,25x, dakle unutar dozvoljenog, pa se računa po
  // proseku od 144 kbps. Po starom (prvi frejm = 128 kbps) ispalo bi 90 s.
  const vbr = bytes(mp3FrameAt(128), mp3FrameAt(160));
  expect(readMediaDuration(vbr, 1_440_000)).toEqual({ ok: true, format: "mp3", seconds: 80 });
});

test("VBR MP3 bez Xing-a sa promenljivim bitrate-om se ODBIJA, ne procenjuje", () => {
  // Napad iz nalaza R3 tačke 2: prvi frejm 320 kbps, ostatak 32 kbps. Po starom
  // se trajanje računalo po prvom frejmu, pa je fajl prijavljivao desetinu
  // stvarne dužine - i to je legalan MP3 koji svaki enkoder ume da napravi.
  const file = bytes(
    mp3FrameAt(320),
    mp3FrameAt(32),
    mp3FrameAt(32),
    mp3FrameAt(32),
    mp3FrameAt(32),
  );

  expect(readMediaDuration(file, 10_000_000)).toEqual({
    ok: false,
    format: "mp3",
    reason: "VBR_NEPOUZDAN",
  });
});

test("Xing zaglavlje nadjačava šetnju - broj frejmova je podatak, prosek je procena", () => {
  // Fajl sa Xing-om se nikad ne procenjuje, pa raspon tarifa ispod njega ne
  // može da ga obori na `VBR_NEPOUZDAN`.
  const file = bytes(mp3Xing(1000), mp3FrameAt(32));

  expect(readMediaDuration(file, 10_000_000)).toMatchObject({ ok: true, format: "mp3" });
});

// ── granice iz veličine fajla ──────────────────────────────────────────────

test("donja granica trajanja je bajtovi kroz najveći mogući bitrate", () => {
  // 288 MB MP3 ne može da traje 6 sekundi: na 320 kbps to je preko dva sata.
  expect(lowerBoundSeconds(288 * 1024 * 1024, "audio/mpeg")).toBeCloseTo(7549.7, 1);
  // Pošten trominutni MP3 na 128 kbps: granica je 72 s, dakle ispod zaglavlja i
  // ne dira ga.
  expect(lowerBoundSeconds(2_880_000, "audio/mpeg")).toBeCloseTo(72, 5);
  // Tačan WAV: 3 s pri 176,4 kB/s je 529 200 bajtova, a granica 1,38 s.
  expect(lowerBoundSeconds(529_200, "audio/wav")).toBeCloseTo(1.378, 3);
});

test("gornja granica trajanja je bajtovi kroz najmanji mogući bitrate", () => {
  // Megabajt zvuka na 8 kbps je 17,5 minuta - deset sati je nemoguće.
  expect(upperBoundSeconds(1024 * 1024, "audio/mpeg")).toBeCloseTo(1048.6, 1);
  expect(upperBoundSeconds(1024 * 1024, "video/mp4")).toBeCloseTo(83.9, 1);
});

test("nepoznat MIME nema granicu, a parametri tipa je ne skrivaju", () => {
  expect(lowerBoundSeconds(1_000_000, "application/octet-stream")).toBeNull();
  expect(upperBoundSeconds(1_000_000, "image/png")).toBeNull();
  // `audio/webm;codecs=opus` je isti tip kao `audio/webm`.
  expect(lowerBoundSeconds(512_000, "audio/webm;codecs=opus")).toBeCloseTo(8, 5);
  expect(lowerBoundSeconds(512_000, " AUDIO/WEBM ")).toBeCloseTo(8, 5);
  // Fajl bez bajtova nema šta da dokaže.
  expect(lowerBoundSeconds(0, "audio/mpeg")).toBeNull();
});

test("svaki merljiv MIME tip ima obe granice - inače granica tiho ne postoji", () => {
  // Isti obrazac kao `catalogModels.test.ts`: uslov je podatak koji test čuva,
  // a ne obećanje u komentaru. Tip koji parser ume da izmeri a nema bitrate
  // tabelu bi prošao kroz naplatu bez ijedne provere iz X1.
  for (const mime of Object.keys(MEASURABLE_MIME)) {
    expect(MAX_PLAUSIBLE_BITRATE_BPS[mime], mime).toBeGreaterThan(0);
    expect(MIN_PLAUSIBLE_BITRATE_BPS[mime], mime).toBeGreaterThan(0);
    expect(MIN_PLAUSIBLE_BITRATE_BPS[mime], mime).toBeLessThan(MAX_PLAUSIBLE_BITRATE_BPS[mime]);
  }
});

// ── WebM ───────────────────────────────────────────────────────────────────

test("WebM daje trajanje iz `Duration`-a i `TimecodeScale`-a", () => {
  const file = webm(8000);

  expect(readMediaDuration(file, file.length)).toEqual({ ok: true, format: "webm", seconds: 8 });
});

test("WebM sa nestandardnom skalom se preračunava, ne pretpostavlja se milisekunda", () => {
  // Skala od 100 000 ns znači da jedan otkucaj traje desetinku milisekunde.
  const file = webm(45_000, 100_000);

  expect(readMediaDuration(file, file.length)).toEqual({ ok: true, format: "webm", seconds: 4.5 });
});

test("WebM bez `Duration`-a u opsegu se odbija", () => {
  const file = bytes(
    ebml([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x86, 0x81, 0x01]),
    [0x18, 0x53, 0x80, 0x67, 0xff],
    ebml([0x15, 0x49, 0xa9, 0x66], ebml([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40])),
  );

  expect(readMediaDuration(file, file.length)).toEqual({
    ok: false,
    format: "webm",
    reason: "ZAGLAVLJE_NIJE_PROCITANO",
  });
});

// ── nepoznato ──────────────────────────────────────────────────────────────

test("nepoznat format se odbija i ne pogadja se trajanje", () => {
  const png = bytes([0x89], tag("PNG"), [0x0d, 0x0a, 0x1a, 0x0a], new Array(64).fill(7));

  expect(readMediaDuration(png, png.length)).toEqual({
    ok: false,
    format: null,
    reason: "NEPOZNAT_FORMAT",
  });
});

test("prazan i skoro prazan fajl se odbijaju", () => {
  expect(readMediaDuration(new Uint8Array(0), 0)).toMatchObject({ ok: false });
  expect(readMediaDuration(Uint8Array.from([0x00, 0x00, 0x00]), 3)).toMatchObject({ ok: false });
});

test("tekst koji sadrži reč `mvhd` ne prolazi kao MP4", () => {
  const text = bytes(tag("Ovo je obican tekst u kojem pise mvhd i nista vise od toga."));

  expect(readMediaDuration(text, text.length)).toEqual({
    ok: false,
    format: null,
    reason: "NEPOZNAT_FORMAT",
  });
});
