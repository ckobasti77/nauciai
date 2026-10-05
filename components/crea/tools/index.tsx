"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { CreaToolProps } from "@/components/crea/tools/types";
import { Spinner } from "@/components/ui/spinner";

/**
 * Granica bundle-a za alate Cree (plan K01 §9): svaki alat je svoj async chunk,
 * a teške biblioteke (MediaPipe, jSquash, exifr, pica, tesseract.js, vectortracer,
 * heic-to, Konva, ONNX Runtime, three.js, mediabunny, perfect-freehand, postprocessing...) se uvoze tek unutar njega -
 * ništa od toga ne ulazi u radionicu ni u zajednički bundle. Next traži da
 * putanja u `import()` bude doslovna, pa po jedan `dynamic` za svaki alat.
 */
function ToolLoading() {
  return (
    <div className="surface-card grid min-h-[220px] place-items-center border-2 border-ink bg-paper-strong">
      <Spinner size="md" className="text-muted" />
    </div>
  );
}

const FormatTool = dynamic(() => import("./format-tool"), { ssr: false, loading: ToolLoading });
const PhotoCheckTool = dynamic(() => import("./photo-check-tool"), { ssr: false, loading: ToolLoading });
const CropTool = dynamic(() => import("./crop-tool"), { ssr: false, loading: ToolLoading });
const SmartCropTool = dynamic(() => import("./smart-crop-tool"), { ssr: false, loading: ToolLoading });
const PaletteTool = dynamic(() => import("./palette-tool"), { ssr: false, loading: ToolLoading });
const QrTool = dynamic(() => import("./qr-tool"), { ssr: false, loading: ToolLoading });
const VectorTool = dynamic(() => import("./vector-tool"), { ssr: false, loading: ToolLoading });
const GifTool = dynamic(() => import("./gif-tool"), { ssr: false, loading: ToolLoading });
const OcrTool = dynamic(() => import("./ocr-tool"), { ssr: false, loading: ToolLoading });
const EditorTool = dynamic(() => import("./editor-tool"), { ssr: false, loading: ToolLoading });
const TemplatesTool = dynamic(() => import("./templates-tool"), { ssr: false, loading: ToolLoading });
const Photo3dTool = dynamic(() => import("./photo-3d-tool"), { ssr: false, loading: ToolLoading });
const BrushTool = dynamic(() => import("./brush-tool"), { ssr: false, loading: ToolLoading });
const SelectTool = dynamic(() => import("./select-tool"), { ssr: false, loading: ToolLoading });
const EraseTool = dynamic(() => import("./erase-tool"), { ssr: false, loading: ToolLoading });
const BackgroundTool = dynamic(() => import("./background-tool"), { ssr: false, loading: ToolLoading });
const UpscaleTool = dynamic(() => import("./upscale-tool"), { ssr: false, loading: ToolLoading });
const ColorTool = dynamic(() => import("./color-tool"), { ssr: false, loading: ToolLoading });
const ReframeTool = dynamic(() => import("./reframe-tool"), { ssr: false, loading: ToolLoading });
const RelightTool = dynamic(() => import("./relight-tool"), { ssr: false, loading: ToolLoading });
const AnglesTool = dynamic(() => import("./angles-tool"), { ssr: false, loading: ToolLoading });
const LayersTool = dynamic(() => import("./layers-tool"), { ssr: false, loading: ToolLoading });
const TextLayerTool = dynamic(() => import("./text-layer-tool"), { ssr: false, loading: ToolLoading });
const RetouchTool = dynamic(() => import("./retouch-tool"), { ssr: false, loading: ToolLoading });
const ProductTool = dynamic(() => import("./product-tool"), { ssr: false, loading: ToolLoading });

export const CREA_TOOL_COMPONENTS: Readonly<Record<string, ComponentType<CreaToolProps>>> = {
  "slika.format": FormatTool,
  "slika.provera": PhotoCheckTool,
  "slika.iseci": CropTool,
  "slika.pametni-isecak": SmartCropTool,
  "slika.paleta": PaletteTool,
  "slika.qr": QrTool,
  "slika.vektor": VectorTool,
  "slika.gif": GifTool,
  "slika.ocr": OcrTool,
  "slika.editor": EditorTool,
  "slika.sabloni": TemplatesTool,
  "slika.3d-foto": Photo3dTool,
  "slika.cetkica": BrushTool,
  "slika.klik": SelectTool,
  "slika.obrisi": EraseTool,
  "slika.pozadina": BackgroundTool,
  "slika.uvecaj": UpscaleTool,
  "slika.boje": ColorTool,
  "slika.prosiri": ReframeTool,
  "slika.svetlo": RelightTool,
  "slika.uglovi": AnglesTool,
  "slika.slojevi": LayersTool,
  "slika.tekst": TextLayerTool,
  "slika.retus": RetouchTool,
  "slika.odeca": ProductTool,
};
