/**
 * Raspored teksta na platnu (S28/S29, K10): prelom u redove i, za polja
 * šablona, smanjivanje slova dok tekst ne stane u svoj okvir. Zato duži naslov
 * u šablonu nikad ne izlazi iz okvira i ne gura ostatak rasporeda - samo se
 * slova smanje (najviše do `minFontSize`, posle toga se red skraćuje sa „…").
 *
 * Merenje širine je spolja (`MeasureText`): u browseru je to `measureText`
 * platna sa istim fontom kojim Konva crta, u testu jednostavna formula. Platno
 * dobija TAČNO ove redove (`wrap: "none"`), pa je ono što smo izračunali i ono
 * što se nacrta isto.
 */

/** Širina teksta u pikselima za dati font, na veličini `fontSize`. */
export type MeasureText = (text: string, fontSize: number) => number;

export type TextLayoutInput = {
  text: string;
  /** Širina okvira; redovi se lome tako da nijedan ne bude širi. */
  width: number;
  /** Visina okvira - samo za `fit`. */
  height?: number;
  /** Željena (najveća) veličina slova. */
  fontSize: number;
  /** Najmanja veličina do koje `fit` sme da smanji slova. */
  minFontSize?: number;
  /** Prored kao množilac veličine slova. */
  lineHeight: number;
  /** Smanji slova dok tekst ne stane u `width × height`. */
  fit: boolean;
};

export type TextLayout = {
  fontSize: number;
  lines: string[];
  /** Visina svih redova (`redovi × veličina × prored`). */
  height: number;
  /** Tekst ni na najmanjoj veličini nije stao, pa je skraćen. */
  truncated: boolean;
  /** Neka reč je bila šira od okvira pa je prelomljena po slovima. */
  brokenWord: boolean;
};

const ELLIPSIS = "…";
export const MIN_FONT_SIZE = 8;

/** Reč šira od okvira se lomi po slovima (npr. dug link ili „AAAAAAAA"). */
function breakWord(word: string, width: number, fontSize: number, measure: MeasureText): string[] {
  const parts: string[] = [];
  let part = "";
  for (const char of Array.from(word)) {
    if (part && measure(part + char, fontSize) > width) {
      parts.push(part);
      part = char;
    } else {
      part += char;
    }
  }
  if (part) parts.push(part);
  return parts;
}

/** Prelom po rečima; prazan red iz teksta ostaje prazan red. */
export function wrapLines(text: string, width: number, fontSize: number, measure: MeasureText): string[] {
  return wrap(text, width, fontSize, measure).lines;
}

function wrap(text: string, width: number, fontSize: number, measure: MeasureText) {
  let brokenWord = false;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fontSize) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, fontSize) <= width) {
        line = word;
      } else {
        brokenWord = true;
        const parts = breakWord(word, width, fontSize, measure);
        lines.push(...parts.slice(0, -1));
        line = parts[parts.length - 1] ?? "";
      }
    }
    lines.push(line);
  }
  return { lines, brokenWord };
}

function linesHeight(count: number, fontSize: number, lineHeight: number) {
  return count * fontSize * lineHeight;
}

/** Poslednji red koji staje, skraćen sa „…" tako da i dalje staje u širinu. */
function withEllipsis(line: string, width: number, fontSize: number, measure: MeasureText): string {
  const chars = Array.from(line.trimEnd());
  while (chars.length > 0 && measure(chars.join("") + ELLIPSIS, fontSize) > width) chars.pop();
  return chars.join("").trimEnd() + ELLIPSIS;
}

export function layoutText(input: TextLayoutInput, measure: MeasureText): TextLayout {
  const max = Math.max(MIN_FONT_SIZE, Math.round(input.fontSize));
  const width = Math.max(1, input.width);
  const layoutAt = (fontSize: number): TextLayout => {
    const { lines, brokenWord } = wrap(input.text, width, fontSize, measure);
    return { fontSize, lines, height: linesHeight(lines.length, fontSize, input.lineHeight), truncated: false, brokenWord };
  };

  if (!input.fit || input.height === undefined) return layoutAt(max);

  const height = Math.max(1, input.height);
  const min = Math.min(max, Math.max(MIN_FONT_SIZE, Math.round(input.minFontSize ?? MIN_FONT_SIZE)));
  // Reč prelomljena po slovima („POČETN-IKE") gora je od manjih slova: prvo se traži
  // veličina na kojoj sve reči staju cele, a tek ako takve nema, prihvata se prelom.
  const fitsWhole = (layout: TextLayout) => layout.height <= height + 0.001 && !layout.brokenWord;
  const fitsAny = (layout: TextLayout) => layout.height <= height + 0.001;

  const atMax = layoutAt(max);
  if (fitsWhole(atMax)) return atMax;

  // Binarna pretraga najveće veličine koja staje (manja slova = manje redova i šire reči staju).
  const largest = (fits: (layout: TextLayout) => boolean): TextLayout | null => {
    let low = min;
    let high = max - 1;
    let best: TextLayout | null = null;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const layout = layoutAt(mid);
      if (fits(layout)) {
        best = layout;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  };
  const best = largest(fitsWhole) ?? (fitsAny(atMax) ? atMax : largest(fitsAny));
  if (best) return best;

  // Ni najmanja veličina ne staje: zadrži koliko redova staje, poslednji sa „…".
  const smallest = layoutAt(min);
  const keep = Math.max(1, Math.floor(height / (min * input.lineHeight) + 0.001));
  const lines = smallest.lines.slice(0, keep);
  lines[lines.length - 1] = withEllipsis(lines[lines.length - 1] ?? "", width, min, measure);
  return {
    fontSize: min,
    lines,
    height: linesHeight(lines.length, min, input.lineHeight),
    truncated: true,
    brokenWord: smallest.brokenWord,
  };
}
