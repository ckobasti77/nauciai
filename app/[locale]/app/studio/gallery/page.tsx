import { redirect } from "next/navigation";
import { normalizeLocale, withLocale } from "@/lib/i18n";

export default async function StudioGalleryRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  const query = await searchParams;
  const locale = normalizeLocale(localeParam);

  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      sp.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    }
  }

  const queryString = sp.toString();
  const target = withLocale(locale, queryString ? `/app/studio?${queryString}` : "/app/studio");
  redirect(target);
}

