import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { retroUniforms, type RetroId, type RetroValues } from "@/lib/crea-retro";

/**
 * Retro efekti na GPU-u (Crea K21, V27; plan K17 §6.3): čist WebGL2, bez
 * three.js. Jedna tekstura za kadar (svaki sledeći kadar ide u ISTU teksturu,
 * `texSubImage2D`), jedan trougao preko celog kadra i po jedan program za
 * efekat, preveden tek kad zatreba.
 *
 * Šum je heš (piksel, seme kadra) - nikad `Math.random` ni sat - pa je kadar N
 * u pregledu isti kao kadar N u izvozu. Krupnoća šuma i linija se meri u
 * delovima visine kadra (540 „ćelija" po visini), ne u pikselima.
 *
 * Učitava se samo kroz `import()` iz alata (`components/crea/tools/retro-tool.tsx`).
 */

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  // Jedan trougao preko celog platna, bez bafera temena; vUv.y = 0 je VRH kadra.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRELUDE = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uImage;
uniform vec2 uSize;
uniform uint uSeed;
uniform float uTime;
uniform float uStrength;
uniform vec4 uParams;

in vec2 vUv;
out vec4 outColor;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

// Slučajan broj 0..1 za ćeliju i „so" (različite vrste šuma ne liče jedna na drugu), po kadru.
float rnd(vec2 cell, uint salt) {
  uvec3 h = pcg3d(uvec3(uvec2(ivec2(floor(cell)) + 65536), uSeed ^ (salt * 2654435761u)));
  return float(h.x) * (1.0 / 4294967295.0);
}

// Isti broj za ceo kadar.
float rndFrame(uint salt) {
  return rnd(vec2(0.0), salt);
}

// Bez semena: tekstura koja stoji (vlakna papira).
float rndStill(vec2 cell, uint salt) {
  uvec3 h = pcg3d(uvec3(uvec2(ivec2(floor(cell)) + 65536), salt * 2654435761u));
  return float(h.x) * (1.0 / 4294967295.0);
}

float valueNoise(vec2 p, uint salt) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = rndStill(i, salt);
  float b = rndStill(i + vec2(1.0, 0.0), salt);
  float c = rndStill(i + vec2(0.0, 1.0), salt);
  float d = rndStill(i + vec2(1.0, 1.0), salt);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Mreža od 540 ćelija po visini: šum je iste krupnoće na svakoj veličini izvoza.
vec2 grid() {
  return vUv * vec2(uSize.x / uSize.y, 1.0) * 540.0;
}

// Jedna ćelija te mreže, u delovima širine (x) i visine (y) kadra.
vec2 cellUv() {
  return vec2(uSize.y / uSize.x, 1.0) / 540.0;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 tex(vec2 uv) {
  return texture(uImage, clamp(uv, 0.0, 1.0)).rgb;
}
`;

/** Telo `main()` po efektu (`uParams` redom kao parametri u `lib/crea-retro.ts`). */
const BODIES: Record<RetroId, string> = {
  // pomak, linije, šum, mekoća
  vhs: `
vec3 rgb2yiq(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 yiq2rgb(vec3 c) {
  return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
}
vec3 blurX(vec2 uv, float radius) {
  vec2 d = vec2(radius, 0.0);
  return (tex(uv - 2.0 * d) + tex(uv - d) * 2.0 + tex(uv) * 2.0 + tex(uv + d) * 2.0 + tex(uv + 2.0 * d)) / 8.0;
}
void main() {
  float s = uStrength;
  float shift = uParams.x * s;
  float track = uParams.y * s;
  float noise = uParams.z * s;
  float soft = uParams.w * s;
  vec2 g = grid();
  float row = floor(g.y);
  vec2 cell = cellUv();
  vec2 uv = vUv;
  // Traka praćenja: pojas koji polako putuje nagore, redovi u njemu beže u stranu.
  float bandY = 1.0 - fract(uTime * 0.12 + 0.35);
  float band = 1.0 - smoothstep(0.0, 0.05, abs(uv.y - bandY));
  uv.x += (rnd(vec2(row, 0.0), 1u) - 0.5) * 0.003 * track;
  uv.x += band * (rnd(vec2(row, 1.0), 2u) - 0.5) * 0.06 * track;
  // Donja ivica kasete (prebacivanje glava) se uvek krivi.
  float bottom = smoothstep(0.965, 1.0, vUv.y);
  uv.x += bottom * (0.02 + rnd(vec2(row, 2.0), 3u) * 0.05) * track;
  // Svetlina mekana, boje još mekše i pomerene udesno (razlivanje boja).
  vec3 base = blurX(uv, (0.5 + 2.5 * soft) * cell.x);
  vec3 bleed = blurX(uv - vec2((1.0 + 7.0 * shift) * cell.x, 0.0), (1.0 + 4.0 * shift + 2.0 * soft) * cell.x);
  vec3 yiq = vec3(rgb2yiq(base).x, rgb2yiq(bleed).yz);
  vec3 col = yiq2rgb(yiq);
  // Izbledela kaseta: manje zasićenja, sivlje crne.
  col = mix(vec3(luma(col)), col, 1.0 - 0.18 * s);
  col = col * (1.0 - 0.07 * s) + 0.04 * s;
  // Šum i bele crtice u traci.
  col += (rnd(g, 4u) - 0.5) * 0.2 * noise;
  float streak = step(0.985, rnd(vec2(floor(g.x / 14.0), row), 5u)) * band;
  col += streak * 0.7 * max(noise, track);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,

  // linije, zakrivljenost, vinjeta, maska
  crt: `
void main() {
  float s = uStrength;
  float lines = uParams.x * s;
  float curve = uParams.y * s;
  float vig = uParams.z * s;
  float mask = uParams.w * s;
  float aspect = uSize.x / uSize.y;
  vec2 cc = vUv - 0.5;
  // Zaobljeno staklo: tačke ka uglovima beže ka spolja, iza ivice je crno.
  vec2 k = cc * vec2(aspect, 1.0) / max(aspect, 1.0);
  vec2 uv = 0.5 + cc * (1.0 + dot(k, k) * 0.45 * curve);
  float edge = smoothstep(0.0, 0.006, uv.x) * smoothstep(0.0, 0.006, 1.0 - uv.x) * smoothstep(0.0, 0.006, uv.y) * smoothstep(0.0, 0.006, 1.0 - uv.y);
  vec3 col = tex(uv);
  // Linije ekrana: najviše 270 po visini, ali bar 3 piksela po liniji (bez treperenja na malom izvozu).
  float count = min(270.0, uSize.y / 3.0);
  float scan = 0.5 + 0.5 * cos(6.2831853 * uv.y * count);
  col *= mix(1.0, 0.5 + 0.5 * scan, lines);
  // RGB tačkice: kolone crvena-zelena-plava.
  float stripe = max(1.0, floor(uSize.y / 540.0));
  int triad = int(mod(floor(gl_FragCoord.x / stripe), 3.0));
  vec3 tint = triad == 0 ? vec3(1.0, 0.7, 0.7) : triad == 1 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0);
  col *= mix(vec3(1.0), tint, mask);
  // Tamne ivice i malo jači sjaj da slika ne potamni.
  col *= 1.0 - vig * 0.8 * smoothstep(0.35, 1.45, length(cc * 2.0));
  col *= 1.0 + 0.35 * lines + 0.2 * mask;
  outColor = vec4(clamp(col * edge, 0.0, 1.0), 1.0);
}`,

  // blokovi, rgb, učestalost
  glic: `
void main() {
  float s = uStrength;
  float blocks = uParams.x * s;
  float split = uParams.y * s;
  // Neki kadrovi su „pokvareni" (koliko često), ostali samo blago drhte.
  float on = step(rndFrame(1u), 0.08 + 0.8 * uParams.z);
  float amount = mix(0.12, 1.0, on);
  vec2 uv = vUv;
  // Pojasevi: ceo red se pomeri levo ili desno.
  float bands = 6.0 + floor(rndFrame(2u) * 18.0);
  float band = floor(uv.y * bands);
  if (rnd(vec2(band, 0.0), 3u) < 0.35 * blocks * amount) {
    uv.x += (rnd(vec2(band, 1.0), 4u) - 0.5) * 0.25 * blocks * amount;
  }
  // Blokovi: pravougaonik uzme sadržaj iz drugog dela kadra.
  vec2 cells = vec2(6.0 + floor(rndFrame(5u) * 10.0), 4.0 + floor(rndFrame(6u) * 12.0));
  vec2 cell = floor(uv * cells);
  float hit = step(rnd(cell, 7u), 0.14 * blocks * amount);
  uv += hit * (vec2(rnd(cell, 8u), rnd(cell, 9u)) - 0.5) * 0.3;
  uv = fract(uv);
  // Boje se razilaze u slučajnom pravcu (više vodoravno).
  float angle = rndFrame(10u) * 6.2831853;
  vec2 offset = vec2(cos(angle), 0.35 * sin(angle)) * split * amount * (0.004 + 0.016 * rndFrame(11u));
  vec3 col = vec3(tex(uv + offset).r, tex(uv).g, tex(uv - offset).b);
  // Ponegde se boje izvrnu ili zamene mesta.
  float flip = hit * step(rnd(cell, 12u), 0.3) * on;
  col = mix(col, flip > 0.5 && rnd(cell, 13u) < 0.5 ? 1.0 - col : col.brg, flip);
  outColor = vec4(col, 1.0);
}`,

  // kontrast, šum
  termo: `
vec3 thermal(float t) {
  float x = clamp(t, 0.0, 1.0) * 6.0;
  vec3 c0 = vec3(0.0, 0.0, 0.02);
  vec3 c1 = vec3(0.08, 0.0, 0.45);
  vec3 c2 = vec3(0.55, 0.0, 0.62);
  vec3 c3 = vec3(0.9, 0.12, 0.2);
  vec3 c4 = vec3(1.0, 0.55, 0.0);
  vec3 c5 = vec3(1.0, 0.92, 0.2);
  vec3 c6 = vec3(1.0, 1.0, 0.95);
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  if (x < 3.0) return mix(c2, c3, x - 2.0);
  if (x < 4.0) return mix(c3, c4, x - 3.0);
  if (x < 5.0) return mix(c4, c5, x - 4.0);
  return mix(c5, c6, x - 5.0);
}
void main() {
  float s = uStrength;
  float contrast = uParams.x;
  float noise = uParams.y;
  // Termo kamera je mutna: prosek okoline.
  vec2 o = cellUv() * 1.5;
  vec3 c = (tex(vUv) * 2.0 + tex(vUv + vec2(o.x, 0.0)) + tex(vUv - vec2(o.x, 0.0)) + tex(vUv + vec2(0.0, o.y)) + tex(vUv - vec2(0.0, o.y))) / 6.0;
  float l = clamp((luma(c) - 0.5) * (0.8 + 1.6 * contrast) + 0.5, 0.0, 1.0);
  l += (rnd(grid(), 1u) - 0.5) * 0.12 * noise;
  outColor = vec4(mix(tex(vUv), thermal(l), s), 1.0);
}`,

  // šum, sjaj, vinjeta
  "nocni-vid": `
void main() {
  float s = uStrength;
  float noise = uParams.x;
  float glow = uParams.y;
  float vig = uParams.z;
  vec3 c = tex(vUv);
  // Pojačalo: tamno postaje vidljivo.
  float amp = pow(luma(c), 0.7) * 1.35;
  // Sjaj: svetla mesta se razliju.
  vec2 o = cellUv() * 6.0;
  float b = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    b += max(luma(tex(vUv + vec2(cos(a), sin(a)) * o)) - 0.55, 0.0);
  }
  amp += (b / 8.0) * 2.5 * glow;
  amp += (rnd(grid(), 1u) - 0.5) * 0.35 * noise;
  vec3 green = vec3(0.12, 1.0, 0.25) * amp + vec3(0.0, 0.03, 0.0);
  // Krug dvogleda (po kraćoj stranici).
  float aspect = uSize.x / uSize.y;
  vec2 cc = (vUv - 0.5) * vec2(aspect, 1.0) / min(aspect, 1.0);
  green *= 1.0 - vig * smoothstep(0.42, 0.72, length(cc));
  outColor = vec4(mix(c, clamp(green, 0.0, 1.0), s), 1.0);
}`,

  // mreža (crta je alat, preko uvećanog kadra), bledilo
  nokia: `
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
void main() {
  float s = uStrength;
  float wash = uParams.y * s;
  vec3 c = tex(vUv);
  // Stari ekran: manje kontrasta, malo zelenkast.
  c = mix(c, c * 0.82 + vec3(0.07, 0.09, 0.06), wash);
  // 4 bita po boji (16 nivoa = 4096 boja), uz tačkasto raspoređivanje greške.
  float d = (bayer4(gl_FragCoord.xy) - 0.5) * s;
  c = floor(c * 15.0 + 0.5 + d) / 15.0;
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,

  // sepija, papir, vinjeta
  "pisaca-masina": `
void main() {
  float s = uStrength;
  float sepia = uParams.x * s;
  float paper = uParams.y * s;
  float vig = uParams.z * s;
  vec3 c = tex(vUv);
  // Malo jači kontrast, kao otisak.
  c = clamp((c - 0.5) * (1.0 + 0.2 * s) + 0.5, 0.0, 1.0);
  vec3 sep = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, min(sep, vec3(1.0)), sepia);
  // Papir: vlakna (stoje, bez semena) i topao ton; crne postaju mastilo na papiru.
  vec2 g = grid();
  float fibres = 0.6 * valueNoise(g * vec2(0.06, 0.6), 1u) + 0.4 * valueNoise(g * 0.25, 2u);
  vec3 tone = vec3(0.97, 0.92, 0.83) * (0.86 + 0.14 * fibres);
  c = mix(c, c * tone + vec3(0.07, 0.055, 0.035) * (1.0 - c), paper);
  // Prašina po kadru i tamne ivice.
  c *= 1.0 - 0.6 * step(1.0 - 0.00012 * paper, rnd(floor(g / 3.0), 3u));
  c *= 1.0 - vig * 0.6 * smoothstep(0.5, 1.45, length((vUv - 0.5) * 2.0));
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,

  // toplina, zrno, ljuljanje, treperenje
  super8: `
void main() {
  float s = uStrength;
  float warm = uParams.x * s;
  float grain = uParams.y * s;
  float weave = uParams.z * s;
  float flicker = uParams.w * s;
  // Ljuljanje: kadar u projektoru skakuće (po kadru) i sporo pluta; malo uvećan da se ivica ne vidi.
  vec2 jump = (vec2(rndFrame(1u), rndFrame(2u)) - 0.5) * vec2(0.004, 0.006);
  vec2 drift = vec2(sin(uTime * 1.7), sin(uTime * 1.1 + 1.3)) * 0.0025;
  vec2 uv = 0.5 + (vUv - 0.5) * (1.0 - 0.014 * weave) + (jump + drift) * weave;
  vec3 c = tex(uv);
  // Topla, izbledela traka.
  c = mix(vec3(luma(c)), c, 1.0 - 0.2 * s);
  c *= vec3(1.0 + 0.1 * warm, 1.0 + 0.02 * warm, 1.0 - 0.18 * warm);
  c = c * (1.0 - 0.08 * s) + vec3(0.05, 0.035, 0.02) * s;
  // Treperenje svetla projektora.
  c *= 1.0 + (rndFrame(3u) - 0.5) * 0.16 * flicker;
  // Zrno (jače u srednjim tonovima) i poneka mrlja prašine.
  vec2 g = grid();
  float l = luma(c);
  c += (rnd(g * 1.5, 4u) - 0.5) * 0.18 * grain * (0.6 + 1.6 * l * (1.0 - l));
  c *= 1.0 - 0.7 * step(1.0 - 0.00006 * grain, rnd(floor(g / 2.0), 5u));
  // Zaobljeni uglovi prozora kamere.
  c *= 1.0 - 0.35 * s * smoothstep(0.7, 1.5, length((vUv - 0.5) * 2.0));
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};

/** Izvor šejdera efekta (za proveru i za prevod). */
export function retroFragmentSource(id: RetroId): string {
  return PRELUDE + BODIES[id];
}

type ProgramInfo = {
  program: WebGLProgram;
  image: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  seed: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  strength: WebGLUniformLocation | null;
  params: WebGLUniformLocation | null;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new CreaLocalAiError("UNSUPPORTED");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new CreaLocalAiError("UNSUPPORTED", new Error(log ?? "SHADER"));
  }
  return shader;
}

/**
 * Crtač retro efekata: `setFrame` (kadar u teksturu), `render` (efekat u
 * `canvas`), `dispose` (oslobađa GPU). Bez WebGL2 baca `UNSUPPORTED`.
 */
export class RetroRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly vertex: WebGLShader;
  private readonly texture: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly programs = new Map<RetroId, ProgramInfo>();
  private width = 0;
  private height = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    // Bafer ostaje posle crtanja: kadar se odmah kopira na 2D platno ili u VideoFrame.
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new CreaLocalAiError("UNSUPPORTED");
    this.gl = gl;
    this.vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const texture = gl.createTexture();
    const vao = gl.createVertexArray();
    if (!texture || !vao) throw new CreaLocalAiError("UNSUPPORTED");
    this.texture = texture;
    this.vao = vao;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Najveća stranica koju GPU ume da nacrta odjednom. */
  get maxSide(): number {
    const gl = this.gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
    const texture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return Math.min(texture, viewport ? Math.min(viewport[0], viewport[1]) : texture);
  }

  /** Kadar `width × height` u teksturu: ista tekstura za svaki kadar, nova memorija samo kad se veličina promeni. */
  setFrame(source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (width !== this.width || height !== this.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.width = width;
      this.height = height;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  private program(id: RetroId): ProgramInfo {
    const cached = this.programs.get(id);
    if (cached) return cached;
    const gl = this.gl;
    const fragment = compile(gl, gl.FRAGMENT_SHADER, retroFragmentSource(id));
    const program = gl.createProgram();
    if (!program) throw new CreaLocalAiError("UNSUPPORTED");
    gl.attachShader(program, this.vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new CreaLocalAiError("UNSUPPORTED", new Error(log ?? "PROGRAM"));
    }
    const info: ProgramInfo = {
      program,
      image: gl.getUniformLocation(program, "uImage"),
      size: gl.getUniformLocation(program, "uSize"),
      seed: gl.getUniformLocation(program, "uSeed"),
      time: gl.getUniformLocation(program, "uTime"),
      strength: gl.getUniformLocation(program, "uStrength"),
      params: gl.getUniformLocation(program, "uParams"),
    };
    this.programs.set(id, info);
    return info;
  }

  /** Efekat na poslednjem kadru, u `canvas` iste veličine. `seed` = `retroSeed(broj kadra)`, `time` = vreme kadra (s). */
  render(id: RetroId, values: RetroValues, seed: number, time: number) {
    if (this.width === 0 || this.height === 0) throw new CreaLocalAiError("BAD_INPUT");
    const gl = this.gl;
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    const info = this.program(id);
    const uniforms = retroUniforms(id, values);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(info.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(info.image, 0);
    gl.uniform2f(info.size, this.width, this.height);
    gl.uniform1ui(info.seed, seed >>> 0);
    gl.uniform1f(info.time, Number.isFinite(time) ? time : 0);
    gl.uniform1f(info.strength, uniforms.strength);
    gl.uniform4f(info.params, ...uniforms.params);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    for (const info of this.programs.values()) gl.deleteProgram(info.program);
    this.programs.clear();
    gl.deleteShader(this.vertex);
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
