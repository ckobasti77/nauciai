import { canvasFont, measurerFor } from "@/components/crea/editor/fonts";
import { layoutText, type TextLayout } from "@/lib/crea-text-fit";
import { layerWindow, type FrameCaptions, type FrameLayer, type FramePlan, type FrameTitle, type TitleFont } from "@/lib/crea-timeline";

/**
 * Crtač kadra montaže (Crea K19, V24; plan K17-2): JEDNA funkcija za pregled i
 * za izvoz. Šta se crta određuje `frameAt` (`lib/crea-timeline.ts`); ovde se
 * plan samo izvrši na 2D platnu - slojevi sa isečkom (cover/contain, Ken Burns),
 * prelaz (providnost, klizanje, zum, brisanje, list sveske), PiP, nalepnice i
 * naslovi. Bez WebGL-a: svi prelazi iz K19 rade na 2D platnu (ODLUKA).
 *
 * Sve mere su u delovima kadra, pa pregled (mali) i izvoz (1080p) izgledaju isto.
 * Boje naslova u kadru su boje brenda svetle teme - deo videa, ne interfejsa.
 */

export type LayerImage = { image: CanvasImageSource; width: number; height: number };

const INK = "#0e3158";
const YELLOW = "#f4be30";

const WEIGHTS: Record<FrameTitle["style"], number> = {
  naslov: 900,
  rukopis: 400,
  "donja-traka": 900,
  titl: 700,
  "pisaca-masina": 400,
};

function weightFor(style: FrameTitle["style"], font: TitleFont): number {
  const wanted = WEIGHTS[style];
  if (font === "rukopis") return 400;
  if (font === "lora") return Math.min(wanted, 700);
  return wanted;
}

const layoutCache = new Map<string, TextLayout>();

function titleLayout(title: FrameTitle, width: number, height: number, weight: number): TextLayout {
  const key = `${title.text}|${title.font}|${weight}|${Math.round(width)}|${Math.round(height)}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const layout = layoutText(
    { text: title.text, width, height, fontSize: Math.max(10, height / 1.15), minFontSize: 10, lineHeight: 1.15, fit: true },
    measurerFor(title.font, weight),
  );
  if (layoutCache.size > 200) layoutCache.clear();
  layoutCache.set(key, layout);
  return layout;
}

/** Izvor u odredište: „cover" kroz prozor (Ken Burns ili sredina), „contain" ceo izvor u sredini. */
function drawSource(
  ctx: CanvasRenderingContext2D,
  layer: FrameLayer,
  source: LayerImage,
  dest: { x: number; y: number; w: number; h: number },
) {
  if (source.width <= 0 || source.height <= 0) return;
  const sourceAspect = source.width / source.height;
  if (layer.fit === "contain") {
    const scale = Math.min(dest.w / source.width, dest.h / source.height);
    const w = source.width * scale;
    const h = source.height * scale;
    ctx.drawImage(source.image, dest.x + (dest.w - w) / 2, dest.y + (dest.h - h) / 2, w, h);
    return;
  }
  const crop = layerWindow(layer, sourceAspect, dest.w / dest.h);
  ctx.drawImage(
    source.image,
    crop.x * source.width,
    crop.y * source.height,
    crop.w * source.width,
    crop.h * source.height,
    dest.x,
    dest.y,
    dest.w,
    dest.h,
  );
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: FrameLayer, source: LayerImage | null, width: number, height: number) {
  const { visual } = layer;
  if (visual.opacity <= 0 || visual.squeezeX <= 0 || visual.clipRight <= 0) return;
  const dest = { x: layer.rect.x * width, y: layer.rect.y * height, w: layer.rect.w * width, h: layer.rect.h * height };
  ctx.save();
  ctx.globalAlpha = Math.min(1, visual.opacity);
  ctx.translate(visual.dx * width, visual.dy * height);
  if (visual.scale !== 1) {
    ctx.translate(width / 2, height / 2);
    ctx.scale(visual.scale, visual.scale);
    ctx.translate(-width / 2, -height / 2);
  }
  if (visual.squeezeX < 1) ctx.scale(visual.squeezeX, 1);
  if (visual.clipRight < 1) {
    ctx.beginPath();
    ctx.rect(dest.x, dest.y, dest.w * visual.clipRight, dest.h);
    ctx.clip();
  }
  if (layer.overlay) {
    // Slika u slici: zaobljen isečak i tanak svetao obrub (deo kadra, ne interfejsa).
    const radius = Math.min(dest.w, dest.h) * 0.08;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(dest.x, dest.y, dest.w, dest.h, radius);
    else ctx.rect(dest.x, dest.y, dest.w, dest.h);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#000000";
    ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
    if (source) drawSource(ctx, layer, source, dest);
    ctx.restore();
    ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.006);
    ctx.strokeStyle = "rgba(255, 253, 248, 0.92)";
    ctx.stroke();
  } else if (source) {
    if (layer.fit === "contain") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
    }
    drawSource(ctx, layer, source, dest);
  }
  if (visual.shade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, visual.shade)})`;
    ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
  }
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, title: FrameTitle, width: number, height: number) {
  if (title.opacity <= 0 || title.chars <= 0) return;
  const weight = weightFor(title.style, title.font);
  const box = { x: title.rect.x * width, y: (title.rect.y + title.dy) * height, w: title.rect.w * width, h: title.rect.h * height };
  const padX = title.style === "donja-traka" || title.style === "titl" ? box.h * 0.22 : 0;
  const layout = titleLayout(title, Math.max(1, box.w - padX * 2), box.h * (title.style === "donja-traka" ? 0.78 : 1), weight);
  const lineHeight = layout.fontSize * 1.15;
  const align: CanvasTextAlign = title.style === "donja-traka" ? "left" : "center";
  const textHeight = layout.lines.length * lineHeight;
  const top = box.y + (box.h - textHeight) / 2;

  ctx.save();
  ctx.globalAlpha = Math.min(1, title.opacity);
  ctx.font = canvasFont(title.font, weight, layout.fontSize);
  ctx.textBaseline = "middle";
  ctx.textAlign = align;

  if (title.style === "donja-traka") {
    // Žuta traka sa mastilom i tvrdom senkom - potpis brenda.
    const longest = Math.max(...layout.lines.map((line) => ctx.measureText(line).width), 1);
    const barW = Math.min(box.w, longest + padX * 2);
    const shadow = Math.max(2, box.h * 0.08);
    ctx.fillStyle = INK;
    ctx.fillRect(box.x + shadow, box.y + shadow, barW, box.h);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(box.x, box.y, barW, box.h);
    ctx.lineWidth = Math.max(1.5, box.h * 0.05);
    ctx.strokeStyle = INK;
    ctx.strokeRect(box.x, box.y, barW, box.h);
  }

  let remaining = title.chars;
  layout.lines.forEach((line, index) => {
    if (remaining <= 0) return;
    const chars = Array.from(line);
    const visible = chars.slice(0, remaining).join("");
    remaining -= chars.length + 1;
    const y = top + lineHeight * (index + 0.5);
    const x = align === "left" ? box.x + padX : box.x + box.w / 2;

    if (title.style === "titl") {
      const fullWidth = ctx.measureText(line).width;
      ctx.fillStyle = "rgba(14, 49, 88, 0.78)";
      const padY = layout.fontSize * 0.12;
      ctx.fillRect(x - fullWidth / 2 - padX, y - lineHeight / 2 - padY / 2, fullWidth + padX * 2, lineHeight + padY);
      ctx.fillStyle = title.color;
      ctx.fillText(visible, align === "center" ? x - (fullWidth - ctx.measureText(visible).width) / 2 : x, y);
      return;
    }

    const drawX = align === "center" ? x - (ctx.measureText(line).width - ctx.measureText(visible).width) / 2 : x;
    if (title.style === "naslov" || title.style === "rukopis") {
      // Tvrda senka bez zamućenja (DNK brenda), u boji mastila.
      const offset = Math.max(1, layout.fontSize * (title.style === "naslov" ? 0.07 : 0.05));
      ctx.fillStyle = INK;
      ctx.fillText(visible, drawX + offset, y + offset);
    } else if (title.style === "pisaca-masina") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillText(visible, drawX + layout.fontSize * 0.04, y + layout.fontSize * 0.04);
    }
    ctx.fillStyle = title.color;
    ctx.fillText(visible, drawX, y);
  });
  ctx.restore();
}

/** Veličina slova titla po stilu, u delovima kraće stranice kadra. */
const CAPTION_SIZE: Record<FrameCaptions["style"], number> = {
  klasican: 0.05,
  "zuta-traka": 0.05,
  karaoke: 0.056,
  veliki: 0.088,
  rukopis: 0.06,
};

/**
 * Titlovi (K21, V25): redovi reči u pravougaoniku stila. Svaki stil je deo
 * videa (boje brenda svetle teme), ne interfejsa. Red širi od kadra smanjuje
 * slova za ceo titl, pa redovi ostaju iste veličine.
 */
export function drawCaptions(ctx: CanvasRenderingContext2D, captions: FrameCaptions, width: number, height: number) {
  const lines = captions.lines.filter((line) => line.length > 0);
  if (lines.length === 0) return;
  const style = captions.style;
  const font: TitleFont = style === "rukopis" ? "rukopis" : "nunito";
  const weight = style === "rukopis" ? 400 : style === "klasican" ? 700 : 900;
  const box = { x: captions.rect.x * width, y: captions.rect.y * height, w: captions.rect.w * width, h: captions.rect.h * height };

  let fontSize = Math.max(10, Math.min(width, height) * CAPTION_SIZE[style]);
  ctx.save();
  ctx.font = canvasFont(font, weight, fontSize);
  const widest = Math.max(...lines.map((line) => ctx.measureText(line.map((word) => word.text).join(" ")).width), 1);
  const padX = style === "klasican" || style === "zuta-traka" ? fontSize * 0.45 : fontSize * 0.2;
  if (widest + padX * 2 > box.w) {
    fontSize = Math.max(10, (fontSize * (box.w - padX * 2)) / widest);
    ctx.font = canvasFont(font, weight, fontSize);
  }
  const lineHeight = fontSize * 1.28;
  const blockHeight = lines.length * lineHeight;
  // „Veliki" stoji u sredini svog pravougaonika, ostali rastu naviše od donje ivice.
  const top = style === "veliki" ? box.y + (box.h - blockHeight) / 2 : box.y + box.h - blockHeight;
  const centerX = box.x + box.w / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  const space = ctx.measureText(" ").width;

  lines.forEach((line, lineIndex) => {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    const lineWidth = widths.reduce((sum, value) => sum + value, 0) + space * (line.length - 1);
    const y = top + lineHeight * (lineIndex + 0.5);
    let x = centerX - lineWidth / 2;

    if (style === "klasican" || style === "zuta-traka") {
      const padY = fontSize * 0.14;
      const rect = { x: x - padX, y: y - lineHeight / 2 - padY / 2, w: lineWidth + padX * 2, h: lineHeight + padY };
      if (style === "zuta-traka") {
        const shadow = Math.max(2, fontSize * 0.1);
        ctx.fillStyle = INK;
        ctx.fillRect(rect.x + shadow, rect.y + shadow, rect.w, rect.h);
        ctx.fillStyle = YELLOW;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.lineWidth = Math.max(1.5, fontSize * 0.06);
        ctx.strokeStyle = INK;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      } else {
        ctx.fillStyle = "rgba(14, 49, 88, 0.8)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }

    line.forEach((word, wordIndex) => {
      const wordWidth = widths[wordIndex]!;
      const spoken = word.state !== "future";
      ctx.save();
      if (style === "veliki" && word.state === "active") {
        // Reč koja se izgovara malo iskoči (1,18 → 1 za ~0,2 s).
        const scale = 1 + 0.18 * (1 - word.enter);
        ctx.translate(x + wordWidth / 2, y);
        ctx.scale(scale, scale);
        ctx.translate(-(x + wordWidth / 2), -y);
      }
      if (style === "karaoke" || style === "veliki") {
        ctx.lineWidth = fontSize * (style === "veliki" ? 0.2 : 0.16);
        ctx.strokeStyle = INK;
        ctx.strokeText(word.text, x, y);
        ctx.fillStyle = style === "karaoke" ? (spoken ? YELLOW : "#ffffff") : word.state === "active" ? YELLOW : "#ffffff";
      } else if (style === "rukopis") {
        const offset = Math.max(1, fontSize * 0.06);
        ctx.fillStyle = INK;
        ctx.fillText(word.text, x + offset, y + offset);
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = style === "zuta-traka" ? INK : "#ffffff";
      }
      ctx.fillText(word.text, x, y);
      ctx.restore();
      x += wordWidth + space;
    });
  });
  ctx.restore();
}

/**
 * Nacrtaj ceo kadar na platno `width × height`. `sourceFor` daje kadar sloja
 * (`<video>`, platno iz dekodera ili sliku); sloj bez izvora se preskače.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  plan: FramePlan,
  width: number,
  height: number,
  sourceFor: (layer: FrameLayer) => LayerImage | null,
  stickerFor: (sticker: string) => CanvasImageSource | null,
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = plan.background;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";

  const main = plan.layers.filter((layer) => !layer.overlay);
  const overlays = plan.layers.filter((layer) => layer.overlay);
  for (const layer of main) drawLayer(ctx, layer, sourceFor(layer), width, height);
  if (plan.dip) {
    ctx.fillStyle = plan.dip.color;
    ctx.globalAlpha = Math.min(1, Math.max(0, plan.dip.alpha));
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  if (plan.wipeEdge !== null) {
    ctx.fillStyle = YELLOW;
    ctx.fillRect(plan.wipeEdge * width - Math.max(1, width * 0.004), 0, Math.max(2, width * 0.008), height);
  }
  for (const layer of overlays) drawLayer(ctx, layer, sourceFor(layer), width, height);

  for (const sticker of plan.stickers) {
    const image = stickerFor(sticker.sticker);
    if (!image || sticker.opacity <= 0) continue;
    const w = sticker.rect.w * width;
    const h = sticker.rect.h * height;
    const side = Math.min(w, h) * sticker.scale;
    ctx.save();
    ctx.globalAlpha = Math.min(1, sticker.opacity);
    ctx.drawImage(image, sticker.rect.x * width + (w - side) / 2, sticker.rect.y * height + (h - side) / 2, side, side);
    ctx.restore();
  }
  for (const title of plan.titles) drawTitle(ctx, title, width, height);
  if (plan.captions) drawCaptions(ctx, plan.captions, width, height);
  ctx.restore();
}
