"use client";

import { RotateCcw } from "lucide-react";

import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { formatNumber, RangeField } from "@/components/crea/zvuk/uredjivac/ui";
import { Button } from "@/components/ui/button";
import { COMPRESSOR_PRESETS, DEFAULT_FX, ECHO_PRESETS, EDIT_LIMITS, EQ_PRESETS, type AudioFx, type CompressorPreset, type EchoPreset, type EqPresetId } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import type { Locale } from "@/lib/i18n";

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

function eqPresetOf(eq: AudioFx["eq"]): EqPresetId | "svoje" {
  const match = (Object.keys(EQ_PRESETS) as EqPresetId[]).find((id) => EQ_PRESETS[id].low === eq.low && EQ_PRESETS[id].mid === eq.mid && EQ_PRESETS[id].high === eq.high);
  return match ?? "svoje";
}

/** Boja zvuka, kompresor, odjek, brzina, visina i jačina glavne trake (Crea K24, A14). */
export function FxPanel({ locale, fx, onChange, disabled }: { locale: Locale; fx: AudioFx; onChange: (patch: Partial<AudioFx>) => void; disabled: boolean }) {
  const preset = eqPresetOf(fx.eq);
  return (
    <div className="space-y-4">
      <ChoiceChips<EqPresetId | "svoje">
        legend={T.editor.eq[locale]}
        name="uredjivac-eq"
        options={(Object.keys(EQ_PRESETS) as EqPresetId[]).map((id) => ({ id, label: T.editor.eqPresets[id][locale] }))}
        value={preset}
        onChange={(id) => id !== "svoje" && onChange({ eq: { ...EQ_PRESETS[id] } })}
        disabled={disabled}
      />
      <div className="space-y-1">
        <RangeField label={T.editor.eqLow[locale]} value={fx.eq.low} min={-EDIT_LIMITS.eqDb} max={EDIT_LIMITS.eqDb} disabled={disabled} format={signed} onChange={(low) => onChange({ eq: { ...fx.eq, low } })} />
        <RangeField label={T.editor.eqMid[locale]} value={fx.eq.mid} min={-EDIT_LIMITS.eqDb} max={EDIT_LIMITS.eqDb} disabled={disabled} format={signed} onChange={(mid) => onChange({ eq: { ...fx.eq, mid } })} />
        <RangeField label={T.editor.eqHigh[locale]} value={fx.eq.high} min={-EDIT_LIMITS.eqDb} max={EDIT_LIMITS.eqDb} disabled={disabled} format={signed} onChange={(high) => onChange({ eq: { ...fx.eq, high } })} />
      </div>
      <ChoiceChips<CompressorPreset>
        legend={T.editor.compressor[locale]}
        name="uredjivac-kompresor"
        options={COMPRESSOR_PRESETS.map((id) => ({ id, label: T.editor.compressors[id][locale] }))}
        value={fx.compressor}
        onChange={(compressor) => onChange({ compressor })}
        disabled={disabled}
      />
      <ChoiceChips<EchoPreset>
        legend={T.editor.echo[locale]}
        name="uredjivac-odjek"
        options={ECHO_PRESETS.map((id) => ({ id, label: T.editor.echoes[id][locale] }))}
        value={fx.echo.preset}
        onChange={(preset) => onChange({ echo: { ...fx.echo, preset } })}
        disabled={disabled}
      />
      {fx.echo.preset !== "off" ? (
        <RangeField label={T.editor.echoMix[locale]} value={Math.round(fx.echo.mix * 100)} min={0} max={100} step={5} disabled={disabled} format={(value) => `${value} %`} onChange={(value) => onChange({ echo: { ...fx.echo, mix: value / 100 } })} />
      ) : null}
      <div className="space-y-1">
        <RangeField
          label={T.editor.speed[locale]}
          value={fx.speed}
          min={EDIT_LIMITS.speed.min}
          max={EDIT_LIMITS.speed.max}
          step={0.05}
          disabled={disabled}
          format={(value) => `${formatNumber(value, locale, 2)}×`}
          onChange={(speed) => onChange({ speed })}
        />
        <RangeField label={T.editor.pitch[locale]} value={fx.pitch} min={-EDIT_LIMITS.pitch} max={EDIT_LIMITS.pitch} disabled={disabled} format={signed} onChange={(pitch) => onChange({ pitch })} />
        <RangeField label={T.editor.gain[locale]} value={fx.gainDb} min={EDIT_LIMITS.gainDb.min} max={EDIT_LIMITS.gainDb.max} disabled={disabled} format={signed} onChange={(gainDb) => onChange({ gainDb })} />
      </div>
      <Button variant="ghost" disabled={disabled} onClick={() => onChange({ ...DEFAULT_FX, eq: { ...DEFAULT_FX.eq }, echo: { ...DEFAULT_FX.echo } })} icon={<RotateCcw aria-hidden="true" className="size-4" />}>
        {T.editor.resetFx[locale]}
      </Button>
    </div>
  );
}
