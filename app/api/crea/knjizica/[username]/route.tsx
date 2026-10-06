import { loadSharedReportCard, usernameFromParam } from "@/lib/crea-report-card-share";
import { reportCardImage } from "@/lib/crea-report-card-image";

/**
 * Deljiva slika đačke knjižice (K26, G5). Samo za knjižicu koju je vlasnik učinio
 * javnom; inače 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const lang = new URL(request.url).searchParams.get("lang");
  const data = await loadSharedReportCard(usernameFromParam(username));
  if (!data) return new Response("Not found", { status: 404 });
  return reportCardImage(data, lang === "en" ? "en" : "sr");
}
