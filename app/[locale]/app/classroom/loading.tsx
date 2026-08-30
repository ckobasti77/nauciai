import { ClassroomHubSkeleton } from "@/components/app/classroom-hub";

// Učionica je do sada bila jedina glavna zona bez `loading.tsx`: dok se ruta učitava,
// student je gledao prazno platno. Isti kostur koji `LiveClassroomHub` pokazuje dok
// traje Convex upit, da se prikaz ne menja između dva čekanja.
export default function ClassroomLoading() {
  return <ClassroomHubSkeleton />;
}
