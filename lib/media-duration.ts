/**
 * Trajanje medija pročitano iz ZAGLAVLJA fajla, kao čista funkcija (W5).
 *
 * Convex storage zna veličinu u bajtovima, ne i koliko snimak traje, a sedam
 * modela kataloga se naplaćuje baš po trajanju (`kling-avatar`,
 * `kling-lipsync`, `kling-motion`, `stt`, `voice-changer`, `audio-isolation`,
 * `dubbing`). Dok je taj broj dolazio od klijenta, jedan poziv sa
 * `measuredQuantity: 0.1` je kupovao $72 posla za 13 kredita (nalaz R3). Od
 * ovog koraka ga meri server, ovim parserom.
 *
 * Namerno BEZ zavisnosti: nijedan od četiri formata ne traži dekodiranje, samo
 * čitanje nekoliko polja iz zaglavlja.
 *
 * | format | odakle trajanje |
 * |---|---|
 * | MP4 / M4A / MOV | `mvhd` atom: `duration / timescale` |
 * | WAV | `fmt ` daje `byteRate`, `data` veličinu: `dataSize / byteRate` |
 * | MP3 | Xing/VBRI broj frejmova, ili procena iz prosečnog bitrate-a |
 * | WebM / MKV | `Duration` i `TimecodeScale` iz `Info` segmenta |
 *
 * Ono što se ne prepozna ili ne pročita NE pada na neku pretpostavku - vraća
 * grešku, a pozivalac odbija posao. Pogrešno izmereno trajanje je pogrešan
 * račun, i u jednom i u drugom smeru.
 */

export type MediaFormat = "mp4" | "wav" | "mp3" | "webm";

export type DurationRead =
  | { ok: true; format: MediaFormat; seconds: number }
  | { ok: false; format: MediaFormat | null; reason: DurationFailure };

/**
 * `NEPOZNAT_FORMAT` - potpis na početku nije nijedan od četiri.
 * `ZAGLAVLJE_NIJE_PROCITANO` - format je prepoznat, ali polja sa trajanjem
 * nema u ovom opsegu bajtova (odsečen fajl, ili `moov` na kraju fajla).
 * `VBR_NEPOUZDAN` - MP3 bez Xing/VBRI zaglavlja čiji se bitrate menja više od
 * dvostruko: procena iz proseka bi bila broj, ali ne bi bila tačan broj (X1).
 */
export type DurationFailure = "NEPOZNAT_FORMAT" | "ZAGLAVLJE_NIJE_PROCITANO" | "VBR_NEPOUZDAN";

/**
 * Koliko bajtova sa početka odnosno kraja fajla je dovoljno.
 *
 * `moov` atom stoji ili na početku (faststart) ili na kraju (izlaz kamere i
 * `ffmpeg` bez `-movflags faststart`), pa se čitaju oba kraja; WAV, WebM i MP3
 * zaglavlje su uvek na početku. Pola megabajta pokriva i ID3 tag sa omotom
 * albuma, a i dalje je 400 puta manje od najvećeg dozvoljenog videa.
 */
export const MEDIA_HEAD_BYTES = 512 * 1024;
export const MEDIA_TAIL_BYTES = 512 * 1024;

/**
 * MIME tipovi čije zaglavlje ovaj parser ume da pročita.
 *
 * Spisak nije ukras: model se u katalog vraća uključen samo ako je SVAKI tip iz
 * `accept` liste njegovog mernog slota ovde (`catalogModels.test.ts`), a
 * `useSlotUpload` po njemu odlučuje da li uopšte da zove merenje. Slika nema
 * trajanje i ne pojavljuje se.
 */
export const MEASURABLE_MIME: Record<string, MediaFormat> = {
  "video/mp4": "mp4",
  "video/quicktime": "mp4",
  "video/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

/** `audio/webm;codecs=opus` je isti tip kao `audio/webm` - parametri ne biraju format. */
function normalizeMime(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export function canMeasure(mimeType: string): boolean {
  return Object.hasOwn(MEASURABLE_MIME, normalizeMime(mimeType));
}

/**
 * Najveći bitrate koji format ume da nosi, u bitovima po sekundi.
 *
 * Ovo je fizika koju zaglavlje ne može da slaže: fajl od N bajtova ne može da
 * traje kraće od `N * 8 / MAKSIMALAN_BITRATE`. Napadač sme da prepravi
 * `mvhd.duration` na 6 sekundi, ali ne sme da smanji fajl - unutra ostaje medij
 * koji provajder obradi i naplati. Zato je taj količnik DONJA granica trajanja
 * i uzima se kad nadjača zaglavlje (nalaz N2).
 *
 * Broj sme da promaši naviše (blaža granica, ništa se ne dešava), ne naniže:
 * granica ispod stvarnog bitrate-a formata bi poštenom fajlu izračunala duže
 * trajanje nego što traje i naplatila ga.
 */
export const MAX_PLAUSIBLE_BITRATE_BPS: Record<string, number> = {
  // MP3 standard ne poznaje tarifu iznad 320 kbps ni na jednom sloju.
  "audio/mpeg": 320_000,
  // 24 bita x 96 kHz x stereo = 4,6 Mbps je gornji rub PCM-a koji se sreće;
  // 3 Mbps pokriva 24/96 mono i 16/96 stereo, a sve preko toga je studijski
  // master koji na ovaj upload ne stiže.
  "audio/wav": 3_072_000,
  "audio/x-wav": 3_072_000,
  // AAC praktičan maksimum: 256 kbps stereo je gornji rub isporuke, 512 kbps
  // je duplo toliko.
  "audio/mp4": 512_000,
  // Opus praktičan maksimum - 510 kbps je granica samog kodeka.
  "audio/webm": 512_000,
  // Gornji rub H.264/H.265 isporuke.
  "video/mp4": 50_000_000,
  // ProRes 422 HQ na 4K ume 200 Mbps, i takav fajl stiže baš kao QuickTime.
  "video/quicktime": 200_000_000,
  // VP9/AV1 isporuka ne prelazi 50 Mbps.
  "video/webm": 50_000_000,
};

/**
 * Najmanji bitrate koji format ume da nosi, u bitovima po sekundi.
 *
 * Ista fizika sa druge strane: fajl od N bajtova ne može da traje duže od
 * `N * 8 / MINIMALAN_BITRATE`. Time se hvata suprotan napad od donje granice -
 * fajl od jednog megabajta sa zaglavljem koje tvrdi deset sati, kojim se pune
 * tudji dnevni plafon i `studioUsageDaily`.
 *
 * Vrednosti su namerno niske: granica sme da propusti previše (napad se hvata
 * tek kad je očigledan), ne sme da odbije pošten fajl.
 */
export const MIN_PLAUSIBLE_BITRATE_BPS: Record<string, number> = {
  // Govor u najlošijem kvalitetu koji se još čuje ide oko 8 kbps.
  "audio/mpeg": 8_000,
  "audio/wav": 8_000,
  "audio/x-wav": 8_000,
  "audio/mp4": 8_000,
  "audio/webm": 8_000,
  // Video ispod 100 kbps nije video - to je slajd šou u pokretu.
  "video/mp4": 100_000,
  "video/quicktime": 100_000,
  "video/webm": 100_000,
};

/**
 * Najkraće trajanje koje fajl te veličine u tom formatu može da ima.
 *
 * `null` za MIME tip koji nije u tabeli: bez poznatog bitrate-a nema granice,
 * pa ostaje zatečeni put (naplaćuje se ono što zaglavlje kaže).
 */
export function lowerBoundSeconds(bytes: number, mimeType: string): number | null {
  return boundSeconds(bytes, mimeType, MAX_PLAUSIBLE_BITRATE_BPS);
}

/** Najduže trajanje koje fajl te veličine u tom formatu može da ima. */
export function upperBoundSeconds(bytes: number, mimeType: string): number | null {
  return boundSeconds(bytes, mimeType, MIN_PLAUSIBLE_BITRATE_BPS);
}

function boundSeconds(
  bytes: number,
  mimeType: string,
  rates: Record<string, number>,
): number | null {
  const mime = normalizeMime(mimeType);
  if (!Object.hasOwn(rates, mime)) return null;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;

  return (bytes * 8) / rates[mime];
}

/**
 * Trajanje u sekundama iz datog opsega bajtova.
 *
 * `totalBytes` je veličina CELOG fajla i koristi se samo za MP3 bez Xing/VBRI
 * zaglavlja, gde se trajanje procenjuje iz prosečnog bitrate-a.
 *
 * Opseg ne mora da bude početak fajla: kad potpisa nema, traži se `mvhd` po
 * potpisu, pa isti poziv radi i nad poslednjih pola megabajta MP4 fajla.
 */
export function readMediaDuration(bytes: Uint8Array, totalBytes: number): DurationRead {
  if (matches(bytes, 0, "RIFF") && matches(bytes, 8, "WAVE")) return readWav(bytes);
  if (matches(bytes, 0, "\x1a\x45\xdf\xa3")) return readWebm(bytes);
  if (isIsoBmff(bytes)) {
    return findMvhd(bytes) ?? { ok: false, format: "mp4", reason: "ZAGLAVLJE_NIJE_PROCITANO" };
  }
  if (isMp3(bytes)) return readMp3(bytes, totalBytes);

  // Bez potpisa na nuli ovo je ili rep MP4 fajla, ili format koji ne znamo.
  return findMvhd(bytes) ?? { ok: false, format: null, reason: "NEPOZNAT_FORMAT" };
}

// ── MP4 / M4A / MOV ────────────────────────────────────────────────────────

/** Tipovi kutija koje smeju da stoje prve u ISO BMFF fajlu. */
const ISO_BOX_TYPES = new Set(["ftyp", "styp", "moov", "mdat", "free", "skip", "wide", "pnot"]);

function isIsoBmff(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && ISO_BOX_TYPES.has(ascii(bytes, 4, 4));
}

/** Fiksna veličina `mvhd` kutije: 8 zaglavlja + 100 odnosno 112 tela. */
const MVHD_V0_SIZE = 108;
const MVHD_V1_SIZE = 120;

/** `mvhd` v0 upisuje ovo kad trajanje nije poznato. */
const MVHD_UNKNOWN = 0xffffffff;

/**
 * `mvhd` se TRAŽI po potpisu umesto da se stablo kutija obilazi od nule.
 * Razlog je rep: poslednjih pola megabajta MP4 fajla ne počinje na granici
 * kutije, pa obilazak odande nema odakle da krene, a `mvhd` je tu.
 *
 * Lažan pogodak je isključen proverom same kutije: pre imena mora da stoji
 * tačna veličina (108 za v0, 120 za v1), a odmah posle njega verzija 0 ili 1 i
 * tri nulte bajta zastavica. `mvhd` u fajlu postoji tačno jednom.
 */
function findMvhd(bytes: Uint8Array): DurationRead | null {
  for (let at = 4; at + 8 <= bytes.length; at += 1) {
    if (bytes[at] !== 0x6d) continue; // "m", pre punog poređenja
    if (ascii(bytes, at, 4) !== "mvhd") continue;

    const size = u32be(bytes, at - 4);
    const body = at + 4;
    const version = bytes[body];
    if (bytes[body + 1] !== 0 || bytes[body + 2] !== 0 || bytes[body + 3] !== 0) continue;

    if (version === 0 && size >= MVHD_V0_SIZE) {
      if (body + 20 > bytes.length) break;
      const duration = u32be(bytes, body + 16);

      return mp4Seconds(u32be(bytes, body + 12), duration === MVHD_UNKNOWN ? 0 : duration);
    }
    if (version === 1 && size >= MVHD_V1_SIZE) {
      if (body + 32 > bytes.length) break;

      return mp4Seconds(u32be(bytes, body + 20), u64be(bytes, body + 24));
    }
  }

  return null;
}

function mp4Seconds(timescale: number, duration: number): DurationRead {
  if (timescale <= 0 || duration <= 0) {
    return { ok: false, format: "mp4", reason: "ZAGLAVLJE_NIJE_PROCITANO" };
  }

  return { ok: true, format: "mp4", seconds: duration / timescale };
}

// ── WAV ────────────────────────────────────────────────────────────────────

/**
 * RIFF je niz komadi `id(4) velicina(4) telo`, počev od bajta 12. Trajanje je
 * odnos dva broja iz dva komada: koliko bajtova ide u sekundu (`fmt `) i
 * koliko ih ukupno ima (`data`).
 */
function readWav(bytes: Uint8Array): DurationRead {
  let at = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at, 4);
    const size = u32le(bytes, at + 4);

    if (id === "fmt " && at + 20 <= bytes.length) byteRate = u32le(bytes, at + 16);
    if (id === "data") {
      dataSize = size;
      break;
    }

    // Telo komada je poravnato na paran broj bajtova.
    at += 8 + size + (size % 2);
  }

  if (byteRate <= 0 || dataSize <= 0) {
    return { ok: false, format: "wav", reason: "ZAGLAVLJE_NIJE_PROCITANO" };
  }

  return { ok: true, format: "wav", seconds: dataSize / byteRate };
}

// ── WebM / MKV ─────────────────────────────────────────────────────────────

const EBML_SEGMENT = 0x18538067;
const EBML_INFO = 0x1549a966;
const EBML_TIMECODE_SCALE = 0x2ad7b1;
const EBML_DURATION = 0x4489;

/** Podrazumevana `TimecodeScale`: koliko nanosekundi traje jedan otkucaj. */
const EBML_DEFAULT_SCALE = 1_000_000;

/**
 * `Duration` je decimalan broj otkucaja i stoji u `Info`-u, prvom elementu
 * `Segment`-a - dakle pri samom početku fajla, pre ijednog klastera.
 */
function readWebm(bytes: Uint8Array): DurationRead {
  const found: { scale?: number; duration?: number } = {};
  scanEbml(bytes, 0, bytes.length, found);
  if (found.duration === undefined || found.duration <= 0) {
    return { ok: false, format: "webm", reason: "ZAGLAVLJE_NIJE_PROCITANO" };
  }

  const scale = found.scale && found.scale > 0 ? found.scale : EBML_DEFAULT_SCALE;

  return { ok: true, format: "webm", seconds: (found.duration * scale) / 1_000_000_000 };
}

function scanEbml(
  bytes: Uint8Array,
  from: number,
  to: number,
  found: { scale?: number; duration?: number },
): void {
  let at = from;

  while (at < to) {
    const id = readVint(bytes, at, true);
    if (!id) return;
    const size = readVint(bytes, at + id.length, false);
    if (!size) return;

    const body = at + id.length + size.length;
    // Master element sme da ima "nepoznatu" veličinu (sve bitove vrednosti na
    // jedinici) - tada traje do kraja opsega koji mu je roditelj dao.
    const end = size.unknown ? to : Math.min(to, body + size.value);
    if (end <= at) return;

    if (id.value === EBML_SEGMENT || id.value === EBML_INFO) {
      scanEbml(bytes, body, end, found);
      if (found.duration !== undefined) return;
    } else if (id.value === EBML_TIMECODE_SCALE && body + size.value <= bytes.length) {
      found.scale = uintBe(bytes, body, size.value);
    } else if (id.value === EBML_DURATION && body + size.value <= bytes.length) {
      found.duration = floatBe(bytes, body, size.value);
    }

    at = end;
  }
}

/**
 * EBML promenljiv ceo broj: vodeća jedinica u prvom bajtu kaže koliko bajtova
 * broj zauzima. Kod ID-ja se marker ZADRŽAVA (0x1A45DFA3 je ceo prvi bajt),
 * kod veličine se skida.
 */
function readVint(
  bytes: Uint8Array,
  at: number,
  keepMarker: boolean,
): { value: number; length: number; unknown: boolean } | null {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;

  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (at + length > bytes.length) return null;

  const payload = first & (mask - 1);
  let value = keepMarker ? first : payload;
  let bare = payload;
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[at + i];
    bare = bare * 256 + bytes[at + i];
  }

  return { value, length, unknown: bare === Math.pow(2, 7 * length) - 1 };
}

// ── MP3 ────────────────────────────────────────────────────────────────────

/** Layer III, po indeksu iz zaglavlja frejma; kbps. */
const MP3_BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MP3_BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MP3_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

function isMp3(bytes: Uint8Array): boolean {
  if (matches(bytes, 0, "ID3")) return true;

  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/**
 * Trajanje MP3 fajla ne stoji nigde direktno.
 *
 * VBR enkoderi ga daju posredno: Xing/Info (LAME) ili VBRI (Fraunhofer)
 * zaglavlje u PRVOM frejmu nosi broj frejmova, a frejm traje uvek isto
 * (1152 uzorka na MPEG 1, 576 na MPEG 2). Fajl bez oba zaglavlja se procenjuje
 * iz veličine i prosečnog bitrate-a prošetanih frejmova (`scanFrames`).
 */
function readMp3(bytes: Uint8Array, totalBytes: number): DurationRead {
  const failed: DurationRead = { ok: false, format: "mp3", reason: "ZAGLAVLJE_NIJE_PROCITANO" };

  const start = skipId3(bytes);
  const at = findFrameSync(bytes, start);
  if (at === null) return failed;
  const frame = parseFrameHeader(bytes, at);
  if (!frame) return failed;

  const xingAt = at + 4 + frame.xingOffset;
  const tag = ascii(bytes, xingAt, 4);
  if (tag === "Xing" || tag === "Info") {
    const flags = u32be(bytes, xingAt + 4);
    // Bit 0 kaže da je broj frejmova upisan; bez njega Xing nosi samo tabelu
    // za premotavanje i ništa od čega bi se računalo trajanje.
    if ((flags & 1) === 1 && xingAt + 12 <= bytes.length) {
      const frames = u32be(bytes, xingAt + 8);
      if (frames > 0) return mp3Seconds(frames, frame);
    }
  }

  const vbriAt = at + 4 + 32;
  if (ascii(bytes, vbriAt, 4) === "VBRI" && vbriAt + 18 <= bytes.length) {
    const frames = u32be(bytes, vbriAt + 14);
    if (frames > 0) return mp3Seconds(frames, frame);
  }

  if (totalBytes <= start) return failed;

  // Bitrate PRVOG frejma nije bitrate fajla, pa se procenjuje iz proseka.
  const scan = scanFrames(bytes, at);
  if (!scan) return failed;
  // Prosek nad rasponom širim od dvostrukog nije procena nego pogađanje.
  // Trajanje se odbija, a posao pada na `MERENJE_NIJE_DOSTUPNO` - donja granica
  // iz veličine fajla (`lowerBoundSeconds`) samo podiže pročitano trajanje, ne
  // izmišlja ga tamo gde ga nema.
  if (scan.max > scan.min * 2) return { ok: false, format: "mp3", reason: "VBR_NEPOUZDAN" };

  return { ok: true, format: "mp3", seconds: ((totalBytes - start) * 8) / scan.average };
}

/** Koliko frejmova se prošeta radi proseka - dovoljno za oko pet sekundi zvuka. */
const MP3_SCAN_FRAMES = 200;

/**
 * Prosečan bitrate prošetanih frejmova i raspon u kojem se kretao.
 *
 * Do ovog koraka se trajanje CBR fajla računalo iz bitrate-a prvog frejma. VBR
 * fajl bez Xing/VBRI zaglavlja čiji je prvi frejm 320 kbps a ostatak 32 kbps
 * tako prijavi desetinu stvarnog trajanja - a to je legalan MP3 koji svaki
 * enkoder ume da napravi, i jedini put na kojem je parser vraćao POGREŠAN broj
 * umesto da odbije posao (nalaz R3 tačka 2).
 *
 * `null` znači da nijedan frejm nije pročitan; CBR fajl daje raspon od jednog
 * broja i isti rezultat kao ranije.
 */
function scanFrames(
  bytes: Uint8Array,
  from: number,
): { average: number; min: number; max: number } | null {
  let at = from;
  let total = 0;
  let count = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  while (count < MP3_SCAN_FRAMES) {
    const frame = parseFrameHeader(bytes, at);
    if (!frame || frame.bitrate <= 0) break;

    total += frame.bitrate;
    count += 1;
    if (frame.bitrate < min) min = frame.bitrate;
    if (frame.bitrate > max) max = frame.bitrate;

    // Dužina frejma u bajtovima: `uzoraka / 8 * bitrate / učestanost`, plus
    // bajt dopune kad deljenje ne izlazi (bit 1 trećeg bajta zaglavlja).
    const padding = (bytes[at + 2] & 0x02) !== 0 ? 1 : 0;
    const length =
      Math.floor((frame.samplesPerFrame / 8) * (frame.bitrate / frame.sampleRate)) + padding;
    if (length <= 4) break;
    at += length;
  }

  if (count === 0) return null;

  return { average: total / count, min, max };
}

type Mp3Frame = { sampleRate: number; samplesPerFrame: number; bitrate: number; xingOffset: number };

function mp3Seconds(frames: number, frame: Mp3Frame): DurationRead {
  return { ok: true, format: "mp3", seconds: (frames * frame.samplesPerFrame) / frame.sampleRate };
}

/** ID3v2 tag stoji ispred zvuka; njegova veličina je zapisana u sedmobitnim bajtovima. */
function skipId3(bytes: Uint8Array): number {
  if (!matches(bytes, 0, "ID3") || bytes.length < 10) return 0;
  const size =
    (bytes[6] & 0x7f) * 0x200000 +
    (bytes[7] & 0x7f) * 0x4000 +
    (bytes[8] & 0x7f) * 0x80 +
    (bytes[9] & 0x7f);
  const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0;

  return 10 + size + footer;
}

function findFrameSync(bytes: Uint8Array, from: number): number | null {
  for (let at = Math.max(0, from); at + 4 <= bytes.length; at += 1) {
    if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) continue;
    if (parseFrameHeader(bytes, at)) return at;
  }

  return null;
}

/**
 * Zaglavlje frejma je četiri bajta: sinhronizacija, verzija i sloj, indeks
 * bitrate-a i učestanosti. Podržan je samo Layer III - to i jeste MP3, a
 * Layer I/II u `audio/mpeg` uploadu praktično ne postoji.
 */
function parseFrameHeader(bytes: Uint8Array, at: number): Mp3Frame | null {
  if (at + 4 > bytes.length) return null;
  const version = (bytes[at + 1] >> 3) & 0x03;
  const layer = (bytes[at + 1] >> 1) & 0x03;
  if (layer !== 1 || version === 1) return null;

  const rates = MP3_RATES[version];
  const sampleRate = rates?.[(bytes[at + 2] >> 2) & 0x03];
  if (!sampleRate) return null;

  const table = version === 3 ? MP3_BITRATES_V1 : MP3_BITRATES_V2;
  const bitrate = table[(bytes[at + 2] >> 4) & 0x0f] * 1000;
  const mono = ((bytes[at + 3] >> 6) & 0x03) === 3;

  return {
    sampleRate,
    samplesPerFrame: version === 3 ? 1152 : 576,
    bitrate,
    // Gde Xing/Info stoji zavisi od verzije i broja kanala - tačno toliko
    // mesta zauzima "side info" blok koji ide pre njega.
    xingOffset: version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17,
  };
}

// ── čitanje brojeva ────────────────────────────────────────────────────────

function ascii(bytes: Uint8Array, at: number, length: number): string {
  if (at < 0 || at + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[at + i]);

  return out;
}

function matches(bytes: Uint8Array, at: number, signature: string): boolean {
  return ascii(bytes, at, signature.length) === signature;
}

function u32be(bytes: Uint8Array, at: number): number {
  if (at < 0 || at + 4 > bytes.length) return 0;

  return bytes[at] * 0x1000000 + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}

function u64be(bytes: Uint8Array, at: number): number {
  return u32be(bytes, at) * 0x100000000 + u32be(bytes, at + 4);
}

function u32le(bytes: Uint8Array, at: number): number {
  if (at < 0 || at + 4 > bytes.length) return 0;

  return bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16) + bytes[at + 3] * 0x1000000;
}

function uintBe(bytes: Uint8Array, at: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i += 1) value = value * 256 + bytes[at + i];

  return value;
}

function floatBe(bytes: Uint8Array, at: number, length: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, length);
  if (length === 4) return view.getFloat32(0);
  if (length === 8) return view.getFloat64(0);

  return 0;
}
