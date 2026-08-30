"use client";


import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, CheckCircle2, Download, FileText, LayoutDashboard, PlayCircle, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { InlineContentText } from "@/components/app/inline-content";
import { InlineRichText, RichTextContent } from "@/components/app/rich-text";
import { CourseLab, type LessonLabData } from "@/components/app/course-lab";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { HandUnderline, Panel } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Course, Lesson, LessonPart } from "@/lib/content";
import { lessonEditPath } from "@/lib/app-routes";
import { lessonStepLabel } from "@/lib/lesson-position";
import { localized, t, type Locale } from "@/lib/i18n";

const AddAssetAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.AddAssetAction), { ssr: false });
const AddLessonPartAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.AddLessonPartAction), { ssr: false });
const EditLessonAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.EditLessonAction), { ssr: false });
const EditLessonPartAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.EditLessonPartAction), { ssr: false });

function PartContent({ part, locale }: { part: LessonPart; locale: Locale }) {
  if (part.kind === "image") {
    if (part.downloadUrl) {
      return <Image src={part.downloadUrl} alt={localized(part.title, locale)} width={1600} height={900} unoptimized className="mt-4 h-auto w-full surface-media border-2 border-ink object-cover" />;
    }
    return <div className="mt-4 grid aspect-video place-items-center surface-media border-2 border-dashed border-ink bg-paper p-6 text-center text-sm font-black text-muted">{locale === "sr" ? "Slika za ovaj deo lekcije još nije dodata." : "The image for this part of the lesson has not been added yet."}</div>;
  }

  if (part.kind === "video") {
    if (part.downloadUrl) {
      return (
        <video
          // Video je vrh hijerarhije lekcije: uokviren mastilom i podignut tvrdom
          // senkom, kao naslovna slika na kartici kursa.
          className="mt-4 aspect-video w-full surface-media border-2 border-ink bg-scrim shadow-[4px_4px_0_0_var(--shadow-hard-15)]"
          src={part.downloadUrl}
          controls
          preload="metadata"
        />
      );
    }

    return (
      <div className="mt-4 flex aspect-video items-center justify-center surface-media border-2 border-dashed border-ink bg-paper p-6 text-center">
        <div>
          <PlayCircle className="mx-auto size-10 text-ink" />
          <p className="mt-3 text-sm font-black text-muted">
            {locale === "sr" ? "Video za ovaj deo lekcije još nije dodat." : "The video for this part of the lesson has not been added yet."}
          </p>
        </div>
      </div>
    );
  }

  if (part.kind === "file") {
    return (
      <div className="mt-4 surface-inset border-2 border-line bg-paper p-4">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-ink">{part.fileName ?? localized(part.title, locale)}</p>
            {part.size ? <p className="text-xs font-bold text-muted">{part.size}</p> : null}
          </div>
          {part.downloadUrl ? (
            <a
              href={part.downloadUrl}
              download={part.fileName}
              className="inline-flex min-h-9 items-center justify-center surface-media gap-2 border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink hover:bg-yellow"
            >
              <Download className="size-4" />
              {locale === "sr" ? "Preuzmi" : "Download"}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return part.body ? (
    <RichTextContent value={locale === "sr" ? part.bodyRich?.sr : part.bodyRich?.en} fallback={localized(part.body, locale)} className="type-reading type-measure text-muted" />
  ) : (
    <p className="mt-4 text-sm font-bold text-muted">
      {locale === "sr" ? "Tekst za ovaj deo lekcije još nije dodat." : "The text for this part of the lesson has not been added yet."}
    </p>
  );
}

function childParts(parts: LessonPart[], parentPartId?: string) {
  return parts
    .filter((part) => (part.parentPartId ?? undefined) === parentPartId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function nextPartSortOrder(parts: LessonPart[], parentPartId?: string) {
  return childParts(parts, parentPartId).reduce((max, part) => Math.max(max, part.sortOrder ?? 0), 0) + 10;
}

export function CoursePlayer({
  course,
  lesson,
  locale,
  lessonId,
  courseId,
  moduleId,
  isAdmin = false,
  inlineLocale = locale,
  inlinePreview = false,
  initialView,
  onViewChange,
}: {
  course: Course;
  lesson: Lesson;
  locale: Locale;
  lessonId?: Id<"lessons">;
  courseId?: Id<"courses">;
  moduleId?: Id<"modules">;
  isAdmin?: boolean;
  inlineLocale?: Locale;
  inlinePreview?: boolean;
  initialView?: "pro" | "light";
  onViewChange?: (view: "pro" | "light") => void;
}) {
  const markProgress = useMutation(api.courses.markProgress);
  const reorderLightBlocks = useMutation(api.contentHierarchy.reorderLightBlocks);
  const deleteLightBlock = useMutation(api.contentHierarchy.deleteLightBlock);
  const deleteLessonAsset = useMutation(api.video.deleteLessonAsset);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip");
  const labData = useQuery(
    api.lab.getLessonLab,
    isAuthenticated && course.slug && lesson.slug ? { courseSlug: course.slug, lessonSlug: lesson.slug } : "skip",
  ) as LessonLabData | null | undefined;
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  // Potvrda brisanja je bila `window.confirm` - nativni OS dijalog bez brenda,
  // bez tokena i bez tamne teme. Sada ide kroz `ConfirmDialog`.
  const [pendingDelete, setPendingDelete] = useState<{ kind: "block" | "asset"; id: string } | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [lessonView, setLessonView] = useState<"pro" | "light">(initialView ?? "light");
  const effectiveIsAdmin = isAdmin || viewerData?.profile?.role === "admin";
  const canUsePro = Boolean(labData?.canUsePro);

  useEffect(() => {
    if (labData === undefined) return;
    const stored = window.localStorage.getItem(`nauci:lesson-view:${course.slug}:${lesson.slug}`);
    queueMicrotask(() => setLessonView(canUsePro && (initialView ?? stored) !== "light" ? "pro" : "light"));
  }, [canUsePro, course.slug, initialView, labData, lesson.slug]);

  function selectLessonView(view: "pro" | "light") {
    if (view === "pro" && !canUsePro) return;
    setLessonView(view);
    window.localStorage.setItem(`nauci:lesson-view:${course.slug}:${lesson.slug}`, view);
    if (onViewChange) onViewChange(view);
    else {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", view);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }

  async function moveBlock(blockId: string, direction: -1 | 1) {
    if (!lessonId) return;
    const ordered = [...lesson.parts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = ordered.findIndex((part) => part.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBlockMessage(null);
    try {
      await reorderLightBlocks({ lessonId, blockIds: ordered.map((part) => part.id).filter(Boolean) as Id<"lessonParts">[] });
      router.refresh();
    } catch (error) {
      setBlockMessage(error instanceof Error ? error.message : t(locale, "Novi redosled nije sačuvan. Osveži stranicu da vidiš pravo stanje, pa pokušaj ponovo.", "The new order was not saved. Refresh the page to see the real state, then try again."));
    }
  }

  async function runPendingDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeletePending(true);
    setBlockMessage(null);
    try {
      if (target.kind === "block") await deleteLightBlock({ blockId: target.id as Id<"lessonParts"> });
      else await deleteLessonAsset({ assetId: target.id as Id<"lessonAssets"> });
      router.refresh();
    } catch (error) {
      setBlockMessage(
        error instanceof Error
          ? error.message
          : target.kind === "block"
            ? t(locale, "Blok nije obrisan. Proveri internet i pokušaj ponovo.", "The block was not deleted. Check your connection and try again.")
            : t(locale, "Materijal nije obrisan. Proveri internet i pokušaj ponovo.", "The material was not deleted. Check your connection and try again."),
      );
    } finally {
      setDeletePending(false);
      setPendingDelete(null);
    }
  }

  if (courseId && lessonId && canUsePro && lessonView === "pro" && labData) {
    return (
      <div className="space-y-4">
        {/* Prekidac prikaza je podredjen sadrzaju lekcije: inset povrsina i etiketa,
            a ne panel sa mastiljavim okvirom koji je do U11 nadjacavao naslov lekcije. */}
        <div className="flex flex-wrap items-center justify-between gap-3 surface-inset border-2 border-line bg-paper p-3">
          <div><p className="type-eyebrow text-muted">{locale === "sr" ? "Prikaz lekcije" : "Lesson view"}</p><p className="mt-1 type-caption font-bold text-muted">{locale === "sr" ? "Pro je podrazumevan za tvoj plan." : "Pro is the default for your plan."}</p></div>
          <div className="flex rounded-full border-2 border-ink bg-paper p-1" role="group" aria-label={locale === "sr" ? "Izaberi prikaz lekcije" : "Choose lesson view"}><button type="button" onClick={() => selectLessonView("pro")} className="rounded-full bg-ink px-4 py-2 text-xs font-black text-paper-strong">Pro</button><button type="button" onClick={() => selectLessonView("light")} className="rounded-full px-4 py-2 text-xs font-black text-ink">Light</button></div>
        </div>
          <CourseLab course={course} lesson={lesson} locale={locale} lab={labData} lessonId={lessonId} inlineEdit={isAdmin} inlineLocale={inlineLocale} />
      </div>
    );
  }

  async function handleMarkComplete() {
    if (!lessonId) {
      setProgressMessage(
        locale === "sr"
          ? "Ova lekcija još nije spremna za praćenje napretka. Javi se predavaču ako ti se ovo ponavlja."
          : "This lesson is not ready to track progress yet. Tell your teacher if this keeps happening.",
      );
      return;
    }

    setIsSavingProgress(true);
    setProgressMessage(null);
    try {
      await markProgress({ lessonId, completed: true, positionSeconds: 0 });
      setProgressMessage(locale === "sr" ? "Zapisali smo da si završio/la ovu lekciju." : "We noted that you finished this lesson.");
    } catch (error) {
      setProgressMessage(
        error instanceof Error
          ? error.message
          : locale === "sr"
            ? "Nismo uspeli da zapišemo da si završio/la lekciju. Proveri internet i klikni ponovo."
            : "We could not record that you finished the lesson. Check your connection and click again.",
      );
    } finally {
      setIsSavingProgress(false);
    }
  }

  function renderPartPanels(): ReactNode {
    const ordered = [...lesson.parts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return ordered.map((part, index) => {
      return (
        // Blokovi lekcije se citaju kao KORACI: isprekidana linija ih razdvaja kao
        // pocepane linije u svesci, a pilula iznad svakog kaze gde je student u lekciji.
        // Redosled sadrzaja se NE dira — samo se imenuje ono sto je vec bilo tu.
        <section key={part.id ?? part.slug} id={`part-${part.slug}`} className="group/block relative scroll-mt-6 border-t-2 border-dashed border-line py-6 first:border-t-0 first:pt-0 last:pb-0">
          {effectiveIsAdmin && part.id ? (
            <div className="absolute right-0 top-2 z-20 flex gap-1 rounded-full border-2 border-ink bg-paper-strong/95 p-1 opacity-0 shadow-[3px_3px_0_var(--shadow-hard)] backdrop-blur transition group-hover/block:opacity-100 group-focus-within/block:opacity-100">
              <EditLessonPartAction locale={locale} courseId={courseId} lessonId={lessonId} lessonPartId={part.id} initial={{ slug: part.slug, parentPartId: part.parentPartId, title: part.title, kind: part.kind, body: part.body, bodyRich: part.bodyRich, fileName: part.fileName, downloadUrl: part.downloadUrl, isPublished: part.isPublished, sortOrder: part.sortOrder }} nextSortOrder={part.sortOrder ?? 10} iconOnly />
              <button type="button" onClick={() => void moveBlock(part.id!, -1)} disabled={index === 0} aria-label={locale === "sr" ? "Pomeri blok nagore" : "Move block up"} className="grid size-8 place-items-center rounded-full border-2 border-ink bg-paper-strong disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
              <button type="button" onClick={() => void moveBlock(part.id!, 1)} disabled={index === ordered.length - 1} aria-label={locale === "sr" ? "Pomeri blok nadole" : "Move block down"} className="grid size-8 place-items-center rounded-full border-2 border-ink bg-paper-strong disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
              <button type="button" onClick={() => setPendingDelete({ kind: "block", id: part.id! })} aria-label={locale === "sr" ? "Obriši blok" : "Delete block"} className="grid size-8 place-items-center rounded-full border-2 border-red-700 bg-paper-strong text-red-700"><Trash2 className="size-3.5" /></button>
            </div>
          ) : null}
          {ordered.length > 1 ? (
            <p className="mb-3 inline-flex items-center rounded-full border-2 border-line bg-paper px-3 py-1 type-eyebrow-sm text-muted">
              {lessonStepLabel(locale, index + 1, ordered.length)}
            </p>
          ) : null}
          {part.kind === "text" ? <InlineRichText kind="part" entityId={part.id ?? ""} parentId={lessonId} field="body" locale={inlineLocale} richSr={part.bodyRich?.sr} richEn={part.bodyRich?.en} sr={part.body?.sr ?? ""} en={part.body?.en ?? ""} admin={isAdmin && Boolean(part.id)} className="type-reading type-measure text-muted" /> : <PartContent part={part} locale={locale} />}
        </section>
      );
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      {/* Isti podredjen prekidac kao u Pro grani — naslov lekcije je prva stvar koja
          se cita, prikaz je podesavanje. */}
      <div className="flex flex-wrap items-center justify-between gap-3 surface-inset border-2 border-line bg-paper p-3 xl:col-span-2">
        <div><p className="type-eyebrow text-muted">{locale === "sr" ? "Prikaz lekcije" : "Lesson view"}</p><p className="mt-1 type-caption font-bold text-muted">{canUsePro ? (locale === "sr" ? "Možeš da menjaš prikaz tokom učenja." : "Switch views while learning.") : (locale === "sr" ? "Pro prikaz je dostupan na višem planu." : "Pro view is available on a higher plan.")}</p></div>
        <div className="flex rounded-full border-2 border-ink bg-paper p-1" role="group" aria-label={locale === "sr" ? "Izaberi prikaz lekcije" : "Choose lesson view"}>
          <button type="button" disabled={!canUsePro} onClick={() => selectLessonView("pro")} title={!canUsePro ? (locale === "sr" ? "Dostupno uz Pro plan" : "Available with Pro") : undefined} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-black text-muted disabled:cursor-not-allowed disabled:opacity-45"><Sparkles className="size-3.5" /> Pro</button>
          <button type="button" onClick={() => selectLessonView("light")} className="rounded-full bg-ink px-4 py-2 text-xs font-black text-paper-strong">Light</button>
        </div>
      </div>
      <section className="space-y-6">
        <Panel className="relative p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              {/* Kurs iznad naslova je „gde sam" na samom ekranu lekcije — do U11 se to
                  videlo samo u sidebar-u, koji je na telefonu zatvoren. */}
              <p className="type-eyebrow text-muted">{localized(course.title, locale)}</p>
              <p className="mt-2 font-display type-display-sm text-ink"><InlineContentText entityId={lessonId ?? ""} parentId={courseId} kind="lesson" field="title" locale={inlineLocale} sr={lesson.title.sr} en={lesson.title.en} admin={isAdmin && Boolean(lessonId)}>{localized(lesson.title, locale)}</InlineContentText></p>
              <HandUnderline size="sm" className="mt-1" />
              <p className="mt-2 max-w-3xl type-body type-measure text-muted"><InlineContentText entityId={lessonId ?? ""} parentId={courseId} kind="lesson" field="summary" locale={inlineLocale} sr={lesson.summary.sr} en={lesson.summary.en} admin={isAdmin && Boolean(lessonId)} multiline>{localized(lesson.summary, locale)}</InlineContentText></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {effectiveIsAdmin && !inlinePreview ? (
                <div className={inlinePreview ? "absolute right-3 top-3 z-20 flex gap-2 rounded-full border-2 border-ink bg-paper-strong/95 p-1 shadow-[3px_3px_0_var(--shadow-hard)] backdrop-blur" : "flex flex-wrap gap-2"}>
                  <EditLessonAction
                    locale={locale}
                    courseId={courseId}
                    courseSlug={course.slug}
                    moduleId={moduleId}
                    lessonId={lessonId}
                    initial={{
                      slug: lesson.slug,
                      title: lesson.title,
                      summary: lesson.summary,
                      summaryRich: lesson.summaryRich,
                      durationSeconds: lesson.durationSeconds,
                      isPublished: lesson.isPublished ?? true,
                      sortOrder: lesson.sortOrder ?? 10,
                    }}
                    nextSortOrder={lesson.sortOrder ?? 10}
                  />
                  <Link
                    href={lessonEditPath(locale, course.slug, lesson.slug)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-4 text-sm font-extrabold text-paper-strong shadow-[3px_3px_0_0_var(--shadow-hard-16)] transition hover:-translate-y-0.5 hover:bg-yellow hover:text-ink"
                  >
                    <LayoutDashboard className="size-4" />
                    {locale === "sr" ? "Admin editor" : "Admin editor"}
                  </Link>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleMarkComplete}
                disabled={isSavingProgress}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-4 text-sm font-extrabold text-ink disabled:cursor-wait disabled:opacity-70"
              >
                {isSavingProgress ? <Spinner /> : <CheckCircle2 className="size-4" />}
                {locale === "sr" ? "Završio/la sam ovu lekciju" : "I finished this lesson"}
              </button>
            </div>
          </div>
          {progressMessage ? <p className="mt-4 text-sm font-bold text-muted">{progressMessage}</p> : null}
        </Panel>

        {/* Telo lekcije je centrirana kolona sirine knjige. Bez ovoga je na sirokom
            ekranu tekst stajao uz levu ivicu panela od ~1000px, a desna polovina je
            ostajala prazan papir (§5 U11). */}
        <div className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[5px_5px_0_var(--shadow-hard-10)] sm:p-6">
          <div className="mx-auto w-full max-w-3xl">
            {lesson.parts.length ? (
              renderPartPanels()
            ) : (
              // Telo lekcije je glavna povrsina ovog ekrana; kad je prazno, ne sme da
              // ostane jedan red teksta u panelu visokom pola ekrana (§5 U11).
              <EmptyState
                icon={FileText}
                title={locale === "sr" ? "Lekcija još nema sadržaj" : "This lesson has no content yet"}
                body={
                  locale === "sr"
                    ? "Ova Light lekcija još nema sadržajnih blokova. Materijali sa strane i dalje mogu da postoje."
                    : "This Light lesson has no content blocks yet. The materials on the side may still be there."
                }
              />
            )}
            {effectiveIsAdmin ? <div className="mt-6 flex justify-center border-t-2 border-dashed border-line pt-5"><AddLessonPartAction locale={locale} courseId={courseId} lessonId={lessonId} nextSortOrder={nextPartSortOrder(lesson.parts)} buttonLabel={locale === "sr" ? "Dodaj blok na dno" : "Add block at the bottom"} /></div> : null}
            {blockMessage ? <p role="alert" className="surface-inset border-2 border-red-700 bg-red-50 p-3 text-sm font-black text-red-800">{blockMessage}</p> : null}
          </div>
        </div>
      </section>

      <Panel className="relative p-4 xl:sticky xl:top-6 xl:h-fit">
        {/* Zaglavlje „belezaka" nosi istu plocicu sa ikonom kao zone komandne table,
            pa se sidebar lekcije prepoznaje bez citanja. */}
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 type-h3 text-ink">
            <span className="grid size-8 shrink-0 place-items-center surface-media border-2 border-ink bg-paper text-ink">
              <FileText aria-hidden="true" className="size-4" />
            </span>
            {locale === "sr" ? "Materijali" : "Materials"}
          </p>
          {effectiveIsAdmin ? <span className={inlinePreview ? "absolute right-3 top-3 z-20" : ""}><AddAssetAction locale={locale} courseId={courseId} lessonId={lessonId} tone="compact" /></span> : null}
        </div>
        <div className="mt-4 space-y-3">
          {lesson.assets.map((asset) => {
            const content = (
              <div className="flex items-start gap-3">
                <FileText className="mt-1 size-4 text-ink" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-ink">{localized(asset.label, locale)}</p>
                  <p className="text-xs font-bold text-muted">{asset.size}</p>
                </div>
                {effectiveIsAdmin && asset.id ? <button type="button" onClick={() => setPendingDelete({ kind: "asset", id: asset.id! })} aria-label={locale === "sr" ? "Obriši materijal" : "Delete material"} className="grid size-8 place-items-center rounded-full border-2 border-red-700 bg-paper-strong text-red-700"><Trash2 className="size-3.5" /></button> : <Download className="size-4 text-ink" />}
              </div>
            );

            return asset.downloadUrl ? (
              <a
                key={localized(asset.label, locale)}
                href={asset.downloadUrl}
                download
                className="block surface-inset border-2 border-line bg-paper p-3 transition hover:border-ink hover:bg-yellow"
              >
                {content}
              </a>
            ) : (
              <div key={localized(asset.label, locale)} className="surface-inset border-2 border-line bg-paper p-3">
                {content}
              </div>
            );
          })}
          {!lesson.assets.length ? (
            <p className="surface-inset border-2 border-dashed border-line bg-paper p-3 text-sm font-black text-muted">
              {locale === "sr" ? "Nema materijala." : "No materials yet."}
            </p>
          ) : null}
        </div>
      </Panel>
      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={runPendingDelete}
        busy={deletePending}
        destructive
        eyebrow={t(locale, "Brisanje", "Delete")}
        title={
          pendingDelete?.kind === "asset"
            ? t(locale, "Obrisati ovaj materijal?", "Delete this material?")
            : t(locale, "Obrisati ovaj sadržajni blok?", "Delete this content block?")
        }
        description={
          pendingDelete?.kind === "asset"
            ? t(
                locale,
                "Materijal nestaje iz lekcije za sve polaznike. Ovo ne može da se poništi.",
                "The material disappears from the lesson for every student. This cannot be undone.",
              )
            : t(
                locale,
                "Blok nestaje iz lekcije za sve polaznike. Ovo ne može da se poništi.",
                "The block disappears from the lesson for every student. This cannot be undone.",
              )
        }
        confirmLabel={t(locale, "Obriši", "Delete")}
        cancelLabel={t(locale, "Odustani", "Cancel")}
        closeLabel={t(locale, "Zatvori", "Close")}
      />
    </div>
  );
}
