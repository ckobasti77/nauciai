import { dbToGain } from "@/lib/crea-audio-plan";
import type { AudioFx, EchoPreset } from "@/lib/crea-audio-edit";
import { COMPRESSOR_SETTINGS, EQ_BANDS, impulseResponse } from "@/lib/crea-audio-fx";

/**
 * Lanac efekata uređivača (Crea K24, A14) za BILO KOJI Web Audio kontekst: isti
 * graf svira uživo (pregled dok pomeraš klizače) i iscrtava izvoz u
 * `OfflineAudioContext`-u - ono što čuješ je ono što dobiješ.
 *
 * ulaz → jačina → EQ (bas, sredina, visoki) → kompresor → nadoknada → suvo + odjek → izlaz
 */
export type FxChain = {
  input: AudioNode;
  output: AudioNode;
  update(fx: AudioFx): void;
};

export function buildFxChain(context: BaseAudioContext, fx: AudioFx): FxChain {
  const input = context.createGain();
  const low = context.createBiquadFilter();
  low.type = EQ_BANDS.low.type;
  low.frequency.value = EQ_BANDS.low.frequency;
  const mid = context.createBiquadFilter();
  mid.type = EQ_BANDS.mid.type;
  mid.frequency.value = EQ_BANDS.mid.frequency;
  mid.Q.value = EQ_BANDS.mid.q;
  const high = context.createBiquadFilter();
  high.type = EQ_BANDS.high.type;
  high.frequency.value = EQ_BANDS.high.frequency;
  const compressor = context.createDynamicsCompressor();
  const makeup = context.createGain();
  const dry = context.createGain();
  const convolver = context.createConvolver();
  convolver.normalize = false;
  const wet = context.createGain();
  const output = context.createGain();

  input.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(compressor);
  compressor.connect(makeup);
  makeup.connect(dry);
  dry.connect(output);
  makeup.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);

  let echoPreset: EchoPreset = "off";

  const update = (next: AudioFx) => {
    input.gain.value = dbToGain(next.gainDb);
    low.gain.value = next.eq.low;
    mid.gain.value = next.eq.mid;
    high.gain.value = next.eq.high;
    if (next.compressor === "off") {
      // Kompresor bez dejstva: prag na vrhu, odnos 1.
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;
      compressor.knee.value = 0;
      makeup.gain.value = 1;
    } else {
      const settings = COMPRESSOR_SETTINGS[next.compressor];
      compressor.threshold.value = settings.threshold;
      compressor.knee.value = settings.knee;
      compressor.ratio.value = settings.ratio;
      compressor.attack.value = settings.attack;
      compressor.release.value = settings.release;
      makeup.gain.value = dbToGain(settings.makeupDb);
    }
    const preset = next.echo.preset;
    if (preset !== echoPreset) {
      echoPreset = preset;
      if (preset === "off") {
        convolver.buffer = null;
      } else {
        const [left, right] = impulseResponse(preset, context.sampleRate);
        const buffer = context.createBuffer(2, left.length, context.sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        convolver.buffer = buffer;
      }
    }
    const mix = preset === "off" ? 0 : next.echo.mix;
    wet.gain.value = mix;
    // Suvo se malo spušta kad je odjeka mnogo, da ukupna jačina ostane slična.
    dry.gain.value = 1 - mix * 0.4;
  };

  update(fx);
  return { input, output, update };
}
