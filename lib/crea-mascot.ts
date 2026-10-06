import {
  mascotJointRange,
  MASCOT_JOINT_KEYS,
  type MascotJointKey,
  type MascotMorph,
  type MascotVariant,
} from "./mascot-rig";

/**
 * Maskota u Crei (K25, U5): postojeći 3D lik (`lib/mascot-rig.ts`) reaguje na stanje rada -
 * razmišlja dok se radi, slavi kad stigne, tužna kad ne uspe. Čista logika: raspoloženje i
 * poza u trenutku `t` (sekunde) kao uglovi zglobova (stepeni, u opsegu RIG.md-a) i uticaji
 * izraza lica. Crta je `components/crea/mascot/*` (3D na računaru, poster na telefonu).
 */

export type CreaMascotMood = "razmislja" | "slavi" | "tuzna" | "miruje";

/** Raspoloženje iz stanja rada: radi se → razmišlja; upravo stigao → slavi; upravo pao → tužna. */
export function mascotMoodFor(state: { working: boolean; justFinished: boolean; justFailed: boolean }): CreaMascotMood {
  if (state.working) return "razmislja";
  if (state.justFailed) return "tuzna";
  if (state.justFinished) return "slavi";
  return "miruje";
}

/** Koliko dugo maskota slavi ili tuguje pre nego što se smiri (ms). */
export const CREA_MASCOT_MOOD_MS = { slavi: 4_000, tuzna: 5_000 } as const;

export type CreaMascotPose = {
  joints: Record<MascotJointKey, number>;
  morphs: Partial<Record<MascotMorph, number>>;
  /** Podizanje celog lika (jedinica visine lika; skok kad slavi). */
  lift: number;
  /** Brzina idle klipa (lebdenje): tužna lebdi sporije. */
  idleSpeed: number;
};

function clampJoint(variant: MascotVariant, key: MascotJointKey, degrees: number): number {
  const range = mascotJointRange(variant, key);
  return Math.min(range.max, Math.max(range.min, degrees));
}

/**
 * Poza u trenutku `t` (sekunde od početka raspoloženja). Oscilacije su sinusne i spore
 * (razmišlja: glava levo-desno 3,2 s, antena 1,1 s), a skok kad slavi traje dve kratke
 * „hop" faze pa se smiri. Svi uglovi su u opsegu zgloba.
 */
export function mascotPoseAt(mood: CreaMascotMood, t: number, variant: MascotVariant): CreaMascotPose {
  const joints = Object.fromEntries(MASCOT_JOINT_KEYS.map((key) => [key, mascotJointRange(variant, key).default])) as Record<MascotJointKey, number>;
  const morphs: Partial<Record<MascotMorph, number>> = {};
  let lift = 0;
  let idleSpeed = 1;

  if (mood === "razmislja") {
    joints.head = 14 * Math.sin((t * 2 * Math.PI) / 3.2);
    joints.neck = 6;
    joints.antenna = 10 * Math.sin((t * 2 * Math.PI) / 1.1);
    joints.elbows = 40;
  } else if (mood === "slavi") {
    const hop = t < 1.2 ? Math.abs(Math.sin((t * Math.PI) / 0.6)) : 0;
    lift = 0.06 * hop;
    joints.shoulders = 48;
    joints.elbows = 25 + 10 * Math.sin(t * 2 * Math.PI);
    joints.antenna = 12 * Math.sin((t * 2 * Math.PI) / 0.5);
    morphs.happy_closed = 1;
    morphs.smile_wide = 0.7;
  } else if (mood === "tuzna") {
    joints.neck = 10;
    joints.head = -6;
    joints.antenna = -15;
    morphs.blink = 0.45;
    idleSpeed = 0.5;
  }

  for (const key of MASCOT_JOINT_KEYS) joints[key] = clampJoint(variant, key, joints[key]);
  return { joints, morphs, lift, idleSpeed };
}

/** Kratka rečenica u oblačiću (i za čitač ekrana); `null` kad maskota miruje. */
export function mascotLine(mood: CreaMascotMood, locale: "sr" | "en"): string | null {
  const lines: Record<Exclude<CreaMascotMood, "miruje">, { sr: string; en: string }> = {
    razmislja: { sr: "Hmm, crtam…", en: "Hmm, drawing…" },
    slavi: { sr: "Gotovo!", en: "Done!" },
    tuzna: { sr: "Ups, nije uspelo.", en: "Oops, that didn't work." },
  };
  return mood === "miruje" ? null : lines[mood][locale];
}

/** Poster maskote (2D rezerva: telefon, smanjen pokret, dok se 3D učitava). */
export const CREA_MASCOT_POSTER = "/images/landing/plan-basic-poster.webp";
