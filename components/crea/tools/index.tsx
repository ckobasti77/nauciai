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
const DraftSheetTool = dynamic(() => import("./draft-sheet-tool"), { ssr: false, loading: ToolLoading });
const SlotsTool = dynamic(() => import("./slots-tool"), { ssr: false, loading: ToolLoading });
const LiveDrawTool = dynamic(() => import("./live-draw-tool"), { ssr: false, loading: ToolLoading });
const SketchTool = dynamic(() => import("./sketch-tool"), { ssr: false, loading: ToolLoading });
const SwapTool = dynamic(() => import("./swap-tool"), { ssr: false, loading: ToolLoading });
const ElementsTool = dynamic(() => import("./elements-tool"), { ssr: false, loading: ToolLoading });
const CharacterTool = dynamic(() => import("./character-tool"), { ssr: false, loading: ToolLoading });
const StickersTool = dynamic(() => import("./stickers-tool"), { ssr: false, loading: ToolLoading });
const LogoTool = dynamic(() => import("./logo-tool"), { ssr: false, loading: ToolLoading });
const BrandKitTool = dynamic(() => import("./brand-kit-tool"), { ssr: false, loading: ToolLoading });
const DescribeTool = dynamic(() => import("./describe-tool"), { ssr: false, loading: ToolLoading });
const LastFrameTool = dynamic(() => import("./last-frame-tool"), { ssr: false, loading: ToolLoading });
const ScenesTool = dynamic(() => import("./scenes-tool"), { ssr: false, loading: ToolLoading });
const DrawMotionTool = dynamic(() => import("./draw-motion-tool"), { ssr: false, loading: ToolLoading });
const ExtendTool = dynamic(() => import("./extend-tool"), { ssr: false, loading: ToolLoading });
// K20: dorada, pokret i govor - mediabunny, MediaPipe i three.js tek unutar alata.
const VideoEditTool = dynamic(() => import("./video-edit-tool"), { ssr: false, loading: ToolLoading });
const VideoReframeTool = dynamic(() => import("./video-reframe-tool"), { ssr: false, loading: ToolLoading });
const VideoColorTool = dynamic(() => import("./video-color-tool"), { ssr: false, loading: ToolLoading });
const VideoBackgroundTool = dynamic(() => import("./video-background-tool"), { ssr: false, loading: ToolLoading });
const VideoUpscaleTool = dynamic(() => import("./video-upscale-tool"), { ssr: false, loading: ToolLoading });
const VideoSlowmoTool = dynamic(() => import("./video-slowmo-tool"), { ssr: false, loading: ToolLoading });
const VideoDeflickerTool = dynamic(() => import("./video-deflicker-tool"), { ssr: false, loading: ToolLoading });
const ActTool = dynamic(() => import("./act-tool"), { ssr: false, loading: ToolLoading });
const TalkingTool = dynamic(() => import("./talking-tool"), { ssr: false, loading: ToolLoading });
// K21: strip → film, titlovi, kratki klipovi, retro, objašnjavajući video, reklama.
const StoryboardTool = dynamic(() => import("./storyboard-tool"), { ssr: false, loading: ToolLoading });
const SubtitlesTool = dynamic(() => import("./subtitles-tool"), { ssr: false, loading: ToolLoading });
const ShortsTool = dynamic(() => import("./shorts-tool"), { ssr: false, loading: ToolLoading });
const RetroTool = dynamic(() => import("./retro-tool"), { ssr: false, loading: ToolLoading });
const ExplainerTool = dynamic(() => import("./explainer-tool"), { ssr: false, loading: ToolLoading });
const AdTool = dynamic(() => import("./ad-tool"), { ssr: false, loading: ToolLoading });
// K28: pomoćnik (U12) i tabla (U13).
const AssistantTool = dynamic(() => import("../assistant/assistant-tool"), { ssr: false, loading: ToolLoading });
const BoardTool = dynamic(() => import("../board/board-tool"), { ssr: false, loading: ToolLoading });
// K22: Zvuk · Govor i Glasovi - svaki alat svoj chunk.
const SpeechTool = dynamic(() => import("../zvuk/speech-tool"), { ssr: false, loading: ToolLoading });
const DialogueTool = dynamic(() => import("../zvuk/dialogue-tool"), { ssr: false, loading: ToolLoading });
const PodcastTool = dynamic(() => import("../zvuk/podcast-tool"), { ssr: false, loading: ToolLoading });
const VoiceLibrary = dynamic(() => import("../zvuk/voice-library"), { ssr: false, loading: ToolLoading });
const DesignTool = dynamic(() => import("../zvuk/design-tool"), { ssr: false, loading: ToolLoading });
const CloneTool = dynamic(() => import("../zvuk/clone-tool"), { ssr: false, loading: ToolLoading });
// K23: Zvuk II.
const VoiceSwapTool = dynamic(() => import("../zvuk/voice-swap-tool"), { ssr: false, loading: ToolLoading });
const DubTool = dynamic(() => import("../zvuk/dub-tool"), { ssr: false, loading: ToolLoading });
const MusicTool = dynamic(() => import("../zvuk/music-tool"), { ssr: false, loading: ToolLoading });
const ScoringTool = dynamic(() => import("../zvuk/scoring-tool"), { ssr: false, loading: ToolLoading });
const SfxTool = dynamic(() => import("../zvuk/sfx-tool"), { ssr: false, loading: ToolLoading });
const StemsTool = dynamic(() => import("../zvuk/stems-tool"), { ssr: false, loading: ToolLoading });
// K24: Zvuk III - wavesurfer, meyda, mediabunny (+ MP3 koder) i modeli tek unutar alata.
const EditorAudioTool = dynamic(() => import("../zvuk/editor-tool"), { ssr: false, loading: ToolLoading });
const RecorderTool = dynamic(() => import("../zvuk/recorder-tool"), { ssr: false, loading: ToolLoading });
const CleanTool = dynamic(() => import("../zvuk/clean-tool"), { ssr: false, loading: ToolLoading });
const TranscriptTool = dynamic(() => import("../zvuk/transcript-tool"), { ssr: false, loading: ToolLoading });
const RhythmTool = dynamic(() => import("../zvuk/rhythm-tool"), { ssr: false, loading: ToolLoading });
const AudiogramTool = dynamic(() => import("../zvuk/audiogram-tool"), { ssr: false, loading: ToolLoading });
// K19: montaža, „Ubaci i gotovo" i izvoz za mreže - svaki svoj chunk; mediabunny i detektor ritma tek unutar njih.
const MontageTool = dynamic(() => import("../montaza/montage-tool"), { ssr: false, loading: ToolLoading });
const BeatTool = dynamic(() => import("../montaza/beat-tool"), { ssr: false, loading: ToolLoading });
const ExportTool = dynamic(() => import("../montaza/export-tool"), { ssr: false, loading: ToolLoading });

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
  "slika.opis": DescribeTool,
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
  "slika.probni-list": DraftSheetTool,
  "slika.ko-gde-kako": SlotsTool,
  "slika.crtaj": LiveDrawTool,
  "slika.skica": SketchTool,
  "slika.zameni-lik": SwapTool,
  "slika.likovi": ElementsTool,
  "slika.kreator-lika": CharacterTool,
  "slika.nalepnice": StickersTool,
  "slika.logo": LogoTool,
  "slika.brend-kit": BrandKitTool,
  "video.poslednji-kadar": LastFrameTool,
  "video.vise-scena": ScenesTool,
  "video.crtaj-pokret": DrawMotionTool,
  "video.produzi": ExtendTool,
  "video.montaza": MontageTool,
  "video.ritam-sabloni": BeatTool,
  "video.izvoz": ExportTool,
  "video.izmeni-recima": VideoEditTool,
  "video.zameni": VideoEditTool,
  "video.reframe": VideoReframeTool,
  "video.boje": VideoColorTool,
  "video.pozadina": VideoBackgroundTool,
  "video.uvecaj": VideoUpscaleTool,
  "video.slowmo": VideoSlowmoTool,
  "video.bez-treperenja": VideoDeflickerTool,
  "video.odglumi": ActTool,
  "video.lik-govori": TalkingTool,
  "video.strip": StoryboardTool,
  "video.titlovi": SubtitlesTool,
  "video.shorts": ShortsTool,
  "video.retro": RetroTool,
  "video.objasnjenje": ExplainerTool,
  "video.reklama": AdTool,
  "zvuk.govor": SpeechTool,
  "zvuk.dijalog": DialogueTool,
  "zvuk.podkast": PodcastTool,
  "zvuk.glasovi": VoiceLibrary,
  "zvuk.dizajn": DesignTool,
  "zvuk.kloniraj": CloneTool,
  "zvuk.promena": VoiceSwapTool,
  "zvuk.prevod": DubTool,
  "zvuk.muzika": MusicTool,
  "zvuk.ozvuci": ScoringTool,
  "zvuk.efekti": SfxTool,
  "zvuk.trake": StemsTool,
  "zvuk.uredjivac": EditorAudioTool,
  "zvuk.snimac": RecorderTool,
  "zvuk.ciscenje": CleanTool,
  "zvuk.transkript": TranscriptTool,
  "zvuk.ritam": RhythmTool,
  "zvuk.audiogram": AudiogramTool,
  "slika.pomocnik": AssistantTool,
  "slika.tabla": BoardTool,
};
