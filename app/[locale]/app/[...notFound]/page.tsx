import { notFound } from "next/navigation";

/**
 * Hvatač neuparenih ruta ispod `/[locale]/app/…` (K23): bez njega bi nepostojeća strana
 * u aplikaciji pala na javni `[...notFound]` i izašla iz ljuske. Poziva `notFound()`,
 * pa se crta `app/[locale]/app/not-found.tsx` unutar ljuske, sa statusom 404.
 */
export default function AppCatchAllNotFound(): never {
  notFound();
}
