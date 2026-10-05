import { BlendFunction, EffectComposer, EffectPass, LookupTexture, LUT3DEffect, NoiseEffect, RenderPass, VignetteEffect } from "postprocessing";
import { CanvasTexture, HalfFloatType, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, WebGLRenderer } from "three";

import { canvasToBlob } from "@/components/crea/tools/canvas";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { LUT_SIZE } from "@/lib/crea-lut";

/**
 * Boje i svetlo (S17, K11) na GPU-u: fotka kao tekstura preko celog kadra,
 * pa `postprocessing` efekti - 3D tabela boja (`LUT3DEffect`, sve iz klizača i
 * izgleda, `lib/crea-lut.ts`), vinjeta i zrno filma. Isti lanac crta i pregled i
 * konačnu sliku u punoj veličini.
 *
 * Učitava se tek iz alata (`import()`), pa three.js i postprocessing ne ulaze u
 * početni JS radionice (`npm run check:bundle`).
 */

export type ColorGrade = { lut: Float32Array; vignette: number; grain: number };

export class ColorRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new MeshBasicMaterial();
  private readonly lutEffect: LUT3DEffect;
  private readonly vignette = new VignetteEffect({ offset: 0.3, darkness: 0 });
  private readonly noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
  private texture: CanvasTexture | null = null;
  private lut: LookupTexture;

  constructor(preserveDrawingBuffer = false) {
    this.canvas = document.createElement("canvas");
    try {
      this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, preserveDrawingBuffer });
    } catch (error) {
      throw new CreaLocalAiError("UNSUPPORTED", error);
    }
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
    this.lut = LookupTexture.createNeutral(LUT_SIZE);
    this.lutEffect = new LUT3DEffect(this.lut, { tetrahedralInterpolation: true });
    this.noise.blendMode.opacity.value = 0;
    // Bafer u pola-float preciznosti: 8-bitni linearni bafer pravi stepenice u senkama.
    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new EffectPass(this.camera, this.lutEffect, this.vignette, this.noise));
  }

  /** Najveća stranica koju GPU ume da nacrta odjednom. */
  get maxSide(): number {
    return this.renderer.capabilities.maxTextureSize;
  }

  /** Platno, ne `ImageBitmap`: WebGL ne ume da okrene bitmapu, pa bi slika stajala naglavačke. */
  setImage(source: HTMLCanvasElement) {
    this.texture?.dispose();
    const texture = new CanvasTexture(source);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.texture = texture;
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  /**
   * Video (K20, V16): sledeći kadar u ISTU teksturu (`needsUpdate`), bez nove
   * teksture po kadru - nova bi po kadru curila GPU memoriju. Prvi kadar ili
   * kadar druge veličine pravi teksturu kao `setImage`.
   */
  setFrame(source: HTMLCanvasElement) {
    const image = this.texture?.image as HTMLCanvasElement | undefined;
    if (!this.texture || image !== source) {
      this.setImage(source);
      return;
    }
    this.texture.needsUpdate = true;
  }

  setGrade(grade: ColorGrade) {
    const next = new LookupTexture(grade.lut, LUT_SIZE);
    this.lutEffect.lut = next;
    this.lut.dispose();
    this.lut = next;
    this.vignette.darkness = grade.vignette * 0.85;
    this.noise.blendMode.opacity.value = grade.grain * 0.35;
  }

  /**
   * `deltaTime` (video, K20): zrno filma zavisi od proteklog vremena; izvoz ga
   * zadaje kao 1/fps, pa je šum po kadru isti pri svakom izvozu (seme = broj kadra).
   * Bez njega (slika) važi sat kao do sada.
   */
  render(width: number, height: number, deltaTime?: number) {
    this.renderer.setPixelRatio(1);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height, false);
    }
    this.composer.render(deltaTime);
  }

  async toBlob(width: number, height: number, type: string, quality: number): Promise<Blob> {
    this.render(width, height);
    return canvasToBlob(this.canvas, type, quality);
  }

  dispose() {
    this.texture?.dispose();
    this.lut.dispose();
    this.material.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
