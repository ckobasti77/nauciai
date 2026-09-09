/**
 * Rig ugovor za `/3d` (3D-FAZA5), pretočen iz `Claude outputs/3d/RIG.md` u kod. Čista
 * geometrija/imena čvorova — bez three.js uvoza, pa je testiljivo bez WebGL-a.
 *
 * Osa: RIG.md daje Blender ose. glTF/three.js: `(x,y,z)_gltf = (x,z,−y)_blender`, pa
 * rotacija oko Blender X = `rotation.x`, oko Blender Z = `rotation.y`, oko Blender Y =
 * `−rotation.z` (`blenderAxisToThree` ispod). Mirroring L/R: isti ugao oko Blender X,
 * suprotan znak oko Blender Y/Z (RIG.md "Napomene za kod").
 */

export type MascotVariant = "basic" | "premium";

export const MASCOT_MODEL_URL: Record<MascotVariant, string> = {
  basic: "/models/mascot-basic.glb",
  premium: "/models/mascot-premium.glb",
};

/** Blender osa rotacije jednog zgloba — vidi konverziju iznad. */
export type BlenderAxis = "bx" | "by" | "bz";

/** Three.js osa + znak dobijeni konverzijom jedne Blender ose. */
export type ThreeAxis = "x" | "y" | "z";

export function blenderAxisToThree(axis: BlenderAxis): { threeAxis: ThreeAxis; sign: 1 | -1 } {
  switch (axis) {
    case "bx":
      return { threeAxis: "x", sign: 1 };
    case "bz":
      return { threeAxis: "y", sign: 1 };
    case "by":
      return { threeAxis: "z", sign: -1 };
  }
}

/** Stepeni -> three.js rotacija za jednu Blender osu (koristi `blenderAxisToThree`). */
export function blenderDegreesToThreeRadians(axis: BlenderAxis, degrees: number): { threeAxis: ThreeAxis; radians: number } {
  const { threeAxis, sign } = blenderAxisToThree(axis);
  return { threeAxis, radians: sign * (degrees * (Math.PI / 180)) };
}

/** Jedan čvor koji jedan klizač pokreće: ime čvora u GLB-u, osa i znak (mirroring). */
export type MascotJointNode = { name: string; axis: BlenderAxis; sign: 1 | -1 };

export type MascotJointKey = "neck" | "head" | "shoulders" | "elbows" | "antenna";

export const MASCOT_JOINT_KEYS: MascotJointKey[] = ["neck", "head", "shoulders", "elbows", "antenna"];

export type MascotJointRange = { min: number; max: number; default: number };

/**
 * Opsezi iz RIG.md. Rame/lakat su asimetrični (0…70, −10…110) — klizač ide preko
 * PUNOG opsega, pa je default na donjoj granici (mirna poza), ne na 0.
 */
const RANGES_BASIC: Record<MascotJointKey, MascotJointRange> = {
  neck: { min: -10, max: 10, default: 0 },
  head: { min: -35, max: 35, default: 0 },
  shoulders: { min: 0, max: 70, default: 0 },
  elbows: { min: -10, max: 110, default: 0 },
  antenna: { min: -15, max: 15, default: 0 },
};

const RANGES_PREMIUM: Record<MascotJointKey, MascotJointRange> = {
  ...RANGES_BASIC,
  elbows: { min: -10, max: 100, default: 0 },
};

export function mascotJointRange(variant: MascotVariant, key: MascotJointKey): MascotJointRange {
  return (variant === "basic" ? RANGES_BASIC : RANGES_PREMIUM)[key];
}

export function mascotDefaultJointValues(variant: MascotVariant): Record<MascotJointKey, number> {
  const values = {} as Record<MascotJointKey, number>;
  for (const key of MASCOT_JOINT_KEYS) values[key] = mascotJointRange(variant, key).default;
  return values;
}

/**
 * Čvorovi koje jedan klizač pokreće, po varijanti. Rame i lakat su parovi (L, R):
 * lakat isti ugao oko X na oba (RIG.md mirroring), rame suprotan znak oko Y jer
 * podizanje ruke gore koristi Blender Y ("Y 0…+70 podizanje L; za R suprotan znak").
 */
export function mascotJointNodes(variant: MascotVariant, key: MascotJointKey): MascotJointNode[] {
  const v = variant;
  switch (key) {
    case "neck":
      return [{ name: `neck_${v}`, axis: "bx", sign: 1 }];
    case "head":
      return [{ name: `helmet_${v}`, axis: "bz", sign: 1 }];
    case "antenna":
      return [{ name: `antenna_stem_${v}`, axis: "by", sign: 1 }];
    case "shoulders":
      return v === "basic"
        ? [
            { name: "shoulder_L_basic", axis: "by", sign: 1 },
            { name: "shoulder_R_basic", axis: "by", sign: -1 },
          ]
        : [
            { name: "arm_cap_L_premium", axis: "by", sign: 1 },
            { name: "arm_cap_R_premium", axis: "by", sign: -1 },
          ];
    case "elbows":
      return v === "basic"
        ? [
            { name: "forearm_L_basic", axis: "bx", sign: 1 },
            { name: "forearm_R_basic", axis: "bx", sign: 1 },
          ]
        : [
            { name: "arm_lo_L_premium", axis: "bx", sign: 1 },
            { name: "arm_lo_R_premium", axis: "bx", sign: 1 },
          ];
  }
}

/** Svi čvorovi koje bar jedan klizač pokreće za datu varijantu — za keširanje refova. */
export function mascotAllJointNodeNames(variant: MascotVariant): string[] {
  return MASCOT_JOINT_KEYS.flatMap((key) => mascotJointNodes(variant, key).map((node) => node.name));
}
