export const profileAvatarPresets = [
  {
    id: "mythic-mentor",
    src: "/images/avatars/mythic-mentor.png",
    labelSr: "Mitski mentor",
    labelEn: "Mythic mentor",
  },
  {
    id: "cosmic-scholar",
    src: "/images/avatars/cosmic-scholar.png",
    labelSr: "Kosmicki ucenjak",
    labelEn: "Cosmic scholar",
  },
  {
    id: "hybrid-guardian",
    src: "/images/avatars/hybrid-guardian.png",
    labelSr: "Hibridni cuvar",
    labelEn: "Hybrid guardian",
  },
] as const;

export type ProfileAvatarPresetId = (typeof profileAvatarPresets)[number]["id"];

export function profileAvatarPresetSrc(id?: string | null) {
  return profileAvatarPresets.find((preset) => preset.id === id)?.src;
}
