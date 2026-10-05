import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, QUALITY_HIGH } from "mediabunny";
import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderer,
} from "three";

import type { ToolRunContext } from "@/components/crea/tool-runner";
import { drawScaled } from "@/components/crea/tools/canvas";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import {
  cameraOffset,
  photo3dCameraDistance,
  photo3dFrames,
  photo3dSegments,
  photo3dStrength,
  photo3dTravel,
  photo3dVideoSize,
  PHOTO3D_FOV,
  PHOTO3D_FPS,
  type Photo3dDuration,
  type Photo3dMotion,
  type Photo3dStrength,
} from "@/lib/crea-photo3d";

/**
 * Reljef u three.js + kamera po putanji → MP4 kroz mediabunny (WebCodecs), za
 * „3D foto" (S33, K10). Zaseban modul sa IMENOVANIM uvozima, koji alat učitava
 * tek posle procene dubine: tako bundler izbaci delove mediabunny-ja i three.js
 * koje ne koristimo (ceo mediabunny je ~170 KB gzip, budžet iz plana je 120 KB).
 */

export type Photo3dSettings = { motion: Photo3dMotion; strength: Photo3dStrength; duration: Photo3dDuration };

const VERTEX = /* glsl */ `
uniform sampler2D depthMap;
uniform float depthScale;
varying vec2 vUv;
void main() {
  vUv = uv;
  float depth = texture2D(depthMap, uv).r;
  vec3 moved = position + vec3(0.0, 0.0, (depth - 0.5) * depthScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D colorMap;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(colorMap, vUv);
  #include <colorspace_fragment>
}
`;

/** Kadar po kadar: crtež pa `CanvasSource.add`, koji čeka koder (bez gomilanja u memoriji). */
export async function renderPhoto3dVideo(
  bitmap: ImageBitmap,
  depthMap: { depth: Float32Array; width: number; height: number },
  settings: Photo3dSettings,
  context: ToolRunContext,
): Promise<{ blob: Blob; width: number; height: number }> {
  const size = photo3dVideoSize(bitmap.width, bitmap.height);
  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
    width: size.width,
    height: size.height,
    quality: QUALITY_HIGH,
  });
  if (!codec) throw new CreaLocalAiError("UNSUPPORTED");

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size.width, size.height, false);
  renderer.outputColorSpace = SRGBColorSpace;

  const { canvas: colorCanvas } = drawScaled(bitmap, 2048);
  const colorMap = new CanvasTexture(colorCanvas);
  colorMap.colorSpace = SRGBColorSpace;
  colorMap.generateMipmaps = true;
  colorMap.minFilter = LinearMipmapLinearFilter;
  colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Mapa ide odozgo nadole, a UV ravni odozdo nagore: redovi se upisuju obrnuto.
  const { width: depthWidth, height: depthHeight } = depthMap;
  const bytes = new Uint8Array(depthMap.depth.length);
  for (let y = 0; y < depthHeight; y++) {
    for (let x = 0; x < depthWidth; x++) {
      bytes[(depthHeight - 1 - y) * depthWidth + x] = Math.round(depthMap.depth[y * depthWidth + x]! * 255);
    }
  }
  const depthTexture = new DataTexture(bytes, depthWidth, depthHeight, RedFormat, UnsignedByteType);
  depthTexture.unpackAlignment = 1;
  depthTexture.magFilter = LinearFilter;
  depthTexture.minFilter = LinearFilter;
  depthTexture.needsUpdate = true;

  const strength = photo3dStrength(settings.strength);
  const aspect = size.width / size.height;
  const segments = photo3dSegments(depthWidth, depthHeight);
  const geometry = new PlaneGeometry(aspect, 1, segments.x, segments.y);
  const material = new ShaderMaterial({
    uniforms: { colorMap: { value: colorMap }, depthMap: { value: depthTexture }, depthScale: { value: strength.depth } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new PerspectiveCamera(PHOTO3D_FOV, aspect, 0.01, 10);
  // Kamera tačno toliko blizu da se ivica fotke ne vidi ni na dubini pozadine (`lib/crea-photo3d.ts`).
  const distance = photo3dCameraDistance(settings.motion, strength, aspect);
  const travel = photo3dTravel(strength.travel, aspect);

  const output = new Output({ format, target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: PHOTO3D_FPS });
  try {
    await output.start();
    const frames = photo3dFrames(settings.duration);
    for (let frame = 0; frame < frames.count; frame++) {
      if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
      const offset = cameraOffset(frame / frames.count, settings.motion, travel);
      camera.position.set(offset.x, offset.y, distance + offset.z);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      await source.add(frame * frames.frameDuration, frames.frameDuration);
      if (frame % 5 === 0) context.reportProgress((frame / frames.count) * 100);
    }
    source.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw toLocalAiError(error, "INFERENCE_FAILED");
  } finally {
    geometry.dispose();
    material.dispose();
    colorMap.dispose();
    depthTexture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new CreaLocalAiError("INFERENCE_FAILED");
  return { blob: new Blob([buffer], { type: "video/mp4" }), ...size };
}
