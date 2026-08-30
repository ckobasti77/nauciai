"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CloudCheck,
  Globe2,
  GraduationCap,
  ImagePlus,
  Loader2,
  Save,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommunityAvatar, type CommunityRank } from "@/components/app/community-identity";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Panel, cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type EditorMode = "create" | "edit";
type EditorStatus = "draft" | "pending" | "published" | "changes_requested";
type SaveState = "idle" | "dirty" | "saving" | "saved_local" | "saved_server" | "error";

export type CommunityEditorPost = {
  _id: string;
  courseId?: string;
  trackId?: string;
  moduleId?: string;
  lessonId?: string;
  scopeKind?: "global" | "track" | "course";
  featuredCourseId?: string;
  isFeaturedGlobal?: boolean;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatarUrl?: string | null;
  authorRank?: CommunityRank;
  courseSlug?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
  imageUrl?: string | null;
  imageStorageId?: string;
  imageMimeType?: string;
  imageFileName?: string;
  status?: EditorStatus;
  moderationReason?: string;
  moderatedAt?: number;
};

type DraftSnapshot = {
  title: string;
  body: string;
  selectedScope?: string;
  selectedCourseId?: string;
  selectedModuleId?: string;
  selectedLessonId?: string;
  savedAt: number;
};

type FilterCourse = {
  _id: string;
  titleSr: string;
  titleEn: string;
  cycles?: Array<{
    _id: string;
    titleSr: string;
    titleEn: string;
    lessons: Array<{
      _id: string;
      titleSr: string;
      titleEn: string;
    }>;
  }>;
};

type FilterTrack = {
  _id: string;
  titleSr: string;
  titleEn: string;
  courses: FilterCourse[];
};

export function CommunityPostEditor({
  locale,
  mode,
  postId,
  initialPost,
}: {
  locale: Locale;
  mode: EditorMode;
  postId?: string;
  initialPost?: CommunityEditorPost;
}) {
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip");
  const viewerProfile = viewerData?.profile;
  const communityFilters = useQuery(api.community.getCommunityFilters, isAuthenticated ? {} : "skip");
  const createPost = useMutation(api.community.createPost);
  const updatePost = useMutation(api.community.updatePost);
  const deletePost = useMutation(api.community.deletePost);
  const generateUploadUrl = useMutation(api.community.createAttachmentUploadUrl);

  const [title, setTitle] = useState(initialPost?.title ?? "");
  const [body, setBody] = useState(initialPost?.body ?? "");
  const [selectedScope, setSelectedScope] = useState(
    initialPost?.scopeKind === "track" && initialPost.trackId
      ? `track:${initialPost.trackId}`
      : initialPost?.courseId
        ? `course:${initialPost.courseId}`
        : "global",
  );
  const [selectedModuleId, setSelectedModuleId] = useState(initialPost?.moduleId ?? "");
  const [selectedLessonId, setSelectedLessonId] = useState(initialPost?.lessonId ?? "");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(initialPost?.imageUrl ?? null);
  const [imageStorageId, setImageStorageId] = useState<string | null>(initialPost?.imageStorageId ?? null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(initialPost?.imageMimeType ?? null);
  const [imageFileName, setImageFileName] = useState<string | null>(initialPost?.imageFileName ?? null);
  const [currentStatus, setCurrentStatus] = useState<EditorStatus>(initialPost?.status ?? "draft");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; body?: string; image?: string }>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [profileResumeHref, setProfileResumeHref] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const isAuthor = !initialPost || initialPost.authorId === viewerProfile?.userId;
  const isStaff = viewerProfile?.role === "admin" || viewerProfile?.role === "moderator";
  const tracks = useMemo<FilterTrack[]>(() => communityFilters?.tracks ?? [], [communityFilters?.tracks]);
  const filterCourses = useMemo<FilterCourse[]>(() => communityFilters?.courses ?? [], [communityFilters?.courses]);
  const selectedCourseId = selectedScope.startsWith("course:") ? selectedScope.slice("course:".length) : "";
  const selectedTrackId = selectedScope.startsWith("track:") ? selectedScope.slice("track:".length) : "";
  const selectedCourse = filterCourses.find((course) => course._id === selectedCourseId)
    ?? tracks.flatMap((track) => track.courses).find((course) => course._id === selectedCourseId);
  const availableCycles = selectedCourse?.cycles ?? [];
  const availableLessons = availableCycles.find((cycle) => cycle._id === selectedModuleId)?.lessons ?? [];
  const storageKey = useMemo(
    () => `nauciai:community-draft:${postId ?? "new"}:${locale}`,
    [locale, postId],
  );

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSuccess(null);
    setSaveState("dirty");
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(withLocale(locale, "/sign-in"));
    }
  }, [isAuthenticated, isLoading, locale, router]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const snapshot = JSON.parse(raw) as DraftSnapshot;
          if (snapshot.savedAt > (initialPost?.updatedAt ?? 0)) {
            setTitle(snapshot.title);
            setBody(snapshot.body);
            setSelectedScope(
              snapshot.selectedScope ??
                (snapshot.selectedCourseId ? `course:${snapshot.selectedCourseId}` : "global"),
            );
            setSelectedModuleId(snapshot.selectedModuleId ?? "");
            setSelectedLessonId(snapshot.selectedLessonId ?? "");
            setLastSavedAt(snapshot.savedAt);
            setSaveState("saved_local");
            setRecoveredDraft(true);
          }
        }
      } catch (caughtError) {
        console.error("Unable to restore the community draft", caughtError);
      } finally {
        setDraftHydrated(true);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [initialPost?.updatedAt, storageKey]);

  useEffect(() => {
    if (!draftHydrated || !dirtyRef.current || pending) return;

    const timer = window.setTimeout(async () => {
      const savedAt = Date.now();
      const snapshot: DraftSnapshot = { title, body, selectedScope, selectedModuleId, selectedLessonId, savedAt };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
        setLastSavedAt(savedAt);

        if (
          mode === "edit" &&
          postId &&
          title.trim() &&
          body.trim() &&
          (currentStatus === "draft" || currentStatus === "changes_requested")
        ) {
          setSaveState("saving");
          await updatePost({
            postId: postId as Id<"communityPosts">,
            title: title.trim(),
            body: body.trim(),
            scope: selectedTrackId
              ? { kind: "track", trackId: selectedTrackId as Id<"courseTracks"> }
              : selectedCourseId
              ? { kind: "course", courseId: selectedCourseId as Id<"courses"> }
              : { kind: "global" },
            ...(selectedCourseId ? { courseId: selectedCourseId as Id<"courses"> } : {}),
            ...(selectedModuleId ? { moduleId: selectedModuleId as Id<"modules"> } : {}),
            ...(selectedLessonId ? { lessonId: selectedLessonId as Id<"lessons"> } : {}),
            ...(imageStorageId
              ? {
                  imageStorageId: imageStorageId as Id<"_storage">,
                  imageMimeType: imageMimeType ?? undefined,
                  imageFileName: imageFileName ?? undefined,
                }
              : {}),
          });
          setSaveState("saved_server");
        } else {
          setSaveState("saved_local");
        }
        dirtyRef.current = false;
      } catch (caughtError) {
        console.error(caughtError);
        setSaveState("error");
      }
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [
    body,
    currentStatus,
    draftHydrated,
    imageFileName,
    imageMimeType,
    imageStorageId,
    mode,
    pending,
    postId,
    selectedCourseId,
    selectedLessonId,
    selectedModuleId,
    selectedScope,
    selectedTrackId,
    storageKey,
    title,
    updatePost,
  ]);

  useEffect(
    () => () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    },
    [],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setFieldErrors((current) => ({
          ...current,
          image: locale === "sr" ? "Ovde možeš da dodaš samo sliku." : "You can only add an image here.",
        }));
        return;
      }

      setUploadingImage(true);
      setFieldErrors((current) => ({ ...current, image: undefined }));
      setFormError(null);
      try {
        if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
        const localUrl = URL.createObjectURL(file);
        previewObjectUrlRef.current = localUrl;
        setImagePreviewUrl(localUrl);

        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
        const payload = (await response.json()) as { storageId?: string };
        if (!payload.storageId) throw new Error("Upload response did not contain a storageId");
        setImageStorageId(payload.storageId);
        setImageMimeType(file.type);
        setImageFileName(file.name);
        markDirty();
      } catch (caughtError) {
        console.error(caughtError);
        if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
        setImagePreviewUrl(initialPost?.imageUrl ?? null);
        setImageStorageId(initialPost?.imageStorageId ?? null);
        setImageMimeType(initialPost?.imageMimeType ?? null);
        setImageFileName(initialPost?.imageFileName ?? null);
        setFieldErrors((current) => ({
          ...current,
          image:
            locale === "sr"
              ? "Slika nije otpremljena. Izaberi je ponovo ili nastavi bez priloga."
              : "The image was not uploaded. Choose it again or continue without an attachment.",
        }));
      } finally {
        setUploadingImage(false);
      }
    }, [
      generateUploadUrl,
      initialPost?.imageFileName,
      initialPost?.imageMimeType,
      initialPost?.imageStorageId,
      initialPost?.imageUrl,
      locale,
      markDirty,
    ],
  );

  useEffect(() => {
    if (!isAuthor) return;

    function includesFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }

    function handleDragEnter(event: DragEvent) {
      if (!includesFiles(event)) return;
      event.preventDefault();
      dragCounter.current += 1;
      setDragActive(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!includesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event: DragEvent) {
      event.preventDefault();
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDragActive(false);
    }

    function handleDrop(event: DragEvent) {
      if (!includesFiles(event)) return;
      event.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) void uploadFile(file);
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [isAuthor, uploadFile]);

  function validate() {
    const errors: { title?: string; body?: string } = {};
    if (!title.trim()) {
      errors.title = locale === "sr" ? "Dodaj naslov koji jasno opisuje temu." : "Add a title that clearly describes the topic.";
    }
    if (!body.trim()) {
      errors.body = locale === "sr" ? "Dodaj pitanje, kontekst ili koristan sadržaj." : "Add a question, context, or useful content.";
    }
    setFieldErrors((current) => ({ ...current, ...errors }));
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(status: "draft" | "pending" | "published") {
    if (!validate() || pending || uploadingImage) return;

    setPending(true);
    setFormError(null);
    setProfileWarning(null);
    setProfileResumeHref(null);
    setSuccess(null);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        scope: selectedTrackId
          ? ({ kind: "track", trackId: selectedTrackId as Id<"courseTracks"> } as const)
          : selectedCourseId
            ? ({ kind: "course", courseId: selectedCourseId as Id<"courses"> } as const)
            : ({ kind: "global" } as const),
        ...(selectedCourseId ? { courseId: selectedCourseId as Id<"courses"> } : {}),
        ...(selectedModuleId ? { moduleId: selectedModuleId as Id<"modules"> } : {}),
        ...(selectedLessonId ? { lessonId: selectedLessonId as Id<"lessons"> } : {}),
        ...(imageStorageId
          ? {
              imageStorageId: imageStorageId as Id<"_storage">,
              imageMimeType: imageMimeType ?? undefined,
              imageFileName: imageFileName ?? undefined,
            }
          : {}),
      };

      const needsProfile = status !== "draft" && !viewerProfile?.username;
      const persistedStatus = needsProfile ? "draft" : status;
      let savedPostId = postId;
      if (mode === "create") {
        savedPostId = await createPost({ ...payload, language: locale, status: persistedStatus });
      } else if (postId) {
        await updatePost({ postId: postId as Id<"communityPosts">, ...payload, status: persistedStatus });
      }

      window.localStorage.removeItem(storageKey);
      dirtyRef.current = false;
      const resolvedStatus: EditorStatus = needsProfile
        ? "draft"
        : status === "draft"
          ? "draft"
          : isStaff
            ? "published"
            : "pending";
      setCurrentStatus(resolvedStatus);
      setSaveState("saved_server");
      setLastSavedAt(Date.now());

      if (needsProfile && savedPostId) {
        const resumePath = withLocale(locale, `/app/community/${savedPostId}/edit`);
        setProfileResumeHref(
          `${withLocale(locale, "/app/profile")}?resumePostId=${encodeURIComponent(savedPostId)}&returnTo=${encodeURIComponent(resumePath)}`,
        );
        setProfileWarning(
          locale === "sr"
            ? "Skica je sačuvana. Izaberi korisničko ime da bi tema mogla da se pošalje na odobrenje ili objavi."
            : "Your draft is saved. Choose a username so this topic can be submitted or published.",
        );
        toast.warning(
          locale === "sr" ? "Skica je sačuvana — izaberi korisničko ime za nastavak." : "Draft saved — choose a username to continue.",
          undefined,
          {
            label: locale === "sr" ? "Podesi profil" : "Complete profile",
            onClick: () => router.push(`${withLocale(locale, "/app/profile")}?resumePostId=${encodeURIComponent(savedPostId)}&returnTo=${encodeURIComponent(resumePath)}`),
          },
        );
        if (mode === "create") {
          router.replace(
            `${resumePath}?resumePostId=${encodeURIComponent(savedPostId)}&returnTo=${encodeURIComponent(resumePath)}`,
          );
        }
      } else if (resolvedStatus === "draft") {
        toast.success(locale === "sr" ? "Skica je sačuvana." : "Draft saved.");
        setSuccess(locale === "sr" ? "Skica je sačuvana." : "Draft saved.");
        if (mode === "create" && savedPostId) {
          router.replace(withLocale(locale, `/app/community/${savedPostId}/edit`));
        }
      } else if (resolvedStatus === "published" && savedPostId) {
        toast.success(locale === "sr" ? "Tema je objavljena." : "Topic published.");
        setSuccess(locale === "sr" ? "Tema je objavljena." : "Topic published.");
        window.setTimeout(() => router.push(withLocale(locale, `/app/community/${savedPostId}`)), 550);
      } else {
        toast.success(locale === "sr" ? "Tema je poslata na odobrenje." : "Topic submitted for review.");
        setSuccess(locale === "sr" ? "Tema je poslata na odobrenje." : "Topic submitted for review.");
        window.setTimeout(
          () => router.push(withLocale(locale, "/app/community/my-threads?view=pending&submitted=1")),
          550,
        );
      }
    } catch (caughtError) {
      console.error(caughtError);
      toast.error(locale === "sr" ? "Tema nije sačuvana." : "The topic could not be saved.");
      setFormError(
        locale === "sr"
          ? "Tema nije sačuvana. Sve što si napisao/la je ostalo u polju — proveri internet i pokušaj ponovo."
          : "The topic was not saved. Everything you wrote is still in the field — check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!postId) return;
    setPending(true);
    setFormError(null);
    try {
      await deletePost({ postId: postId as Id<"communityPosts"> });
      window.localStorage.removeItem(storageKey);
      router.push(withLocale(locale, "/app/community/my-threads"));
    } catch (caughtError) {
      console.error(caughtError);
      setDeleteOpen(false);
      setFormError(
        locale === "sr"
          ? "Tema nije obrisana. Osveži stranicu i pokušaj ponovo."
          : "The topic was not deleted. Refresh the page and try again.",
      );
      setPending(false);
    }
  }

  function restoreOriginalImage() {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = null;
    setImagePreviewUrl(initialPost?.imageUrl ?? null);
    setImageStorageId(initialPost?.imageStorageId ?? null);
    setImageMimeType(initialPost?.imageMimeType ?? null);
    setImageFileName(initialPost?.imageFileName ?? null);
    setFieldErrors((current) => ({ ...current, image: undefined }));
    markDirty();
  }

  const authorName = initialPost?.authorName ?? viewerProfile?.name ?? (locale === "sr" ? "Član" : "Member");
  const authorAvatarUrl = initialPost?.authorAvatarUrl ?? viewerProfile?.avatarUrl;
  const authorRole = initialPost?.authorRole ?? viewerProfile?.role ?? "student";
  const backHref = postId
    ? withLocale(locale, `/app/community/${postId}`)
    : withLocale(locale, "/app/community/discussions");

  if (isLoading || (isAuthenticated && (viewerData === undefined || communityFilters === undefined))) {
    return (
      <div className="grid min-h-96 place-items-center" aria-busy="true" aria-label={locale === "sr" ? "Učitavanje polja za pisanje" : "Loading the writing area"}>
        <Loader2 className="size-9 animate-spin text-yellow motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-5 pb-8">
      {dragActive ? (
        <div
          className="pointer-events-none fixed inset-0 z-[110] grid place-items-center border-[6px] border-dashed border-ink bg-yellow/90 p-6 text-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-lg text-ink">
            <span className="mx-auto inline-flex size-20 items-center justify-center rounded-full border-2 border-ink bg-paper-strong shadow-[5px_5px_0_var(--ink)] motion-safe:animate-pulse">
              <UploadCloud className="size-9" />
            </span>
            <p className="mt-5 text-2xl font-black md:text-4xl">
              {locale === "sr" ? "Spusti sliku bilo gde" : "Drop the image anywhere"}
            </p>
            <p className="mt-2 text-sm font-bold opacity-75">
              {locale === "sr" ? "Dodaćemo je kao sliku uz temu." : "We’ll add it as the image for this topic."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-strong px-4 text-sm font-black text-ink transition hover:border-ink hover:bg-yellow/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowLeft className="size-4" />
          {postId ? (locale === "sr" ? "Nazad na temu" : "Back to topic") : locale === "sr" ? "Nazad na diskusije" : "Back to discussions"}
        </Link>
        <SaveIndicator locale={locale} state={saveState} lastSavedAt={lastSavedAt} />
      </div>

      {recoveredDraft ? (
        <div role="status" className="flex items-start gap-3 rounded-[16px] border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
          <CloudCheck className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-black">{locale === "sr" ? "Vraćena je novija skica" : "A newer draft was restored"}</p>
            <p className="mt-0.5 text-xs font-semibold leading-5">
              {locale === "sr" ? "Nastavi tamo gde si stao na ovom uređaju." : "Continue where you left off on this device."}
            </p>
          </div>
        </div>
      ) : null}

      {currentStatus === "changes_requested" ? (
        <div className="flex items-start gap-3 rounded-[16px] border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-black">{locale === "sr" ? "Izmene koje je tražio moderator" : "Changes requested by a moderator"}</p>
            <p className="mt-1 text-sm font-semibold leading-6">
              {initialPost?.moderationReason ||
                (locale === "sr" ? "Proveri sadržaj pre ponovnog slanja." : "Review the content before submitting it again.")}
            </p>
          </div>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {formError}
        </p>
      ) : null}
      {profileWarning && profileResumeHref ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-2 border-ink bg-yellow/30 px-4 py-3 text-sm font-bold text-ink">
          <span className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-5 shrink-0" />
            {profileWarning}
          </span>
          <Link
            href={profileResumeHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard)]"
          >
            {locale === "sr" ? "Podesi profil" : "Complete profile"}
          </Link>
        </div>
      ) : null}
      {success ? (
        <p role="status" className="flex items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">
          <CheckCircle2 className="size-4" />
          {success}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <Panel className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper-strong shadow-[6px_6px_0_var(--shadow-hard-13)]">
            <div className="border-b border-line bg-paper/55 px-5 py-5 md:px-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CommunityAvatar
                    name={authorName}
                    avatarUrl={authorAvatarUrl}
                    role={authorRole}
                    rank={initialPost?.authorRank}
                    locale={locale}
                    size="md"
                  />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.06em] text-ink/45">{locale === "sr" ? "Autor" : "Author"}</p>
                    <p className="text-sm font-black text-ink">{authorName}</p>
                  </div>
                </div>
                <span className="rounded-full border border-line bg-paper-strong px-3 py-1.5 text-xs font-black text-ink/65">
                  {statusText(currentStatus, locale)}
                </span>
              </div>
            </div>

            <div className="space-y-7 p-5 md:p-7">
              <div>
                <label htmlFor="community-title" className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
                  {locale === "sr" ? "Naslov teme" : "Topic title"}
                </label>
                <input
                  id="community-title"
                  type="text"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setFieldErrors((current) => ({ ...current, title: undefined }));
                    markDirty();
                  }}
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? "community-title-error" : "community-title-help"}
                  placeholder={locale === "sr" ? "Šta želiš da pitaš ili podeliš?" : "What do you want to ask or share?"}
                  maxLength={160}
                  className="mt-2 w-full rounded-[12px] border border-line bg-paper-strong px-4 py-3 text-xl font-black leading-tight text-ink transition placeholder:text-ink/30 focus:border-ink focus:ring-4 focus:ring-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:text-3xl"
                />
                {fieldErrors.title ? (
                  <p id="community-title-error" className="mt-2 text-xs font-bold text-red-700">{fieldErrors.title}</p>
                ) : (
                  <p id="community-title-help" className="mt-2 text-xs font-semibold text-muted">
                    {locale === "sr" ? "Kratak naslov pomaže članovima da brže pronađu temu." : "A concise title helps members find the topic faster."}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="community-scope" className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
                  {locale === "sr" ? "Gde pripada tema" : "Where this topic belongs"}
                </label>
                <div className="relative mt-2">
                  {selectedScope !== "global" ? (
                    <GraduationCap className="pointer-events-none absolute left-3 top-3.5 size-4 text-ink/55" />
                  ) : (
                    <Globe2 className="pointer-events-none absolute left-3 top-3.5 size-4 text-ink/55" />
                  )}
                  <select
                    id="community-scope"
                    value={selectedScope}
                    onChange={(event) => {
                      setSelectedScope(event.target.value);
                      setSelectedModuleId("");
                      setSelectedLessonId("");
                      markDirty();
                    }}
                    className="min-h-11 w-full appearance-none rounded-[12px] border border-line bg-paper-strong py-2.5 pl-10 pr-4 text-sm font-black text-ink transition focus:border-ink focus:ring-4 focus:ring-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <option value="global">{locale === "sr" ? "Globalna zajednica" : "Global community"}</option>
                    {tracks.map((track) => (
                      <optgroup key={track._id} label={locale === "sr" ? track.titleSr : track.titleEn}>
                        <option value={`track:${track._id}`}>
                          {locale === "sr" ? `Ceo smer: ${track.titleSr}` : `Entire track: ${track.titleEn}`}
                        </option>
                        {track.courses.map((course) => (
                          <option key={course._id} value={`course:${course._id}`}>
                            {locale === "sr" ? `Kurs: ${course.titleSr}` : `Course: ${course.titleEn}`}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {filterCourses
                      .filter((course) => !tracks.some((track) => track.courses.some((item) => item._id === course._id)))
                      .map((course) => (
                        <option key={course._id} value={`course:${course._id}`}>
                          {locale === "sr" ? `Kurs: ${course.titleSr}` : `Course: ${course.titleEn}`}
                        </option>
                      ))}
                  </select>
                </div>
                {selectedCourseId ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label>
                      <span className="sr-only">{locale === "sr" ? "Izaberi ciklus" : "Choose cycle"}</span>
                      <select
                        value={selectedModuleId}
                        onChange={(event) => {
                          setSelectedModuleId(event.target.value);
                          setSelectedLessonId("");
                          markDirty();
                        }}
                        className="min-h-11 w-full rounded-[12px] border border-line bg-paper-strong px-3 text-sm font-black text-ink transition focus:border-ink focus:ring-4 focus:ring-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <option value="">{locale === "sr" ? "Izaberi ciklus" : "Choose a cycle"}</option>
                        {availableCycles.map((cycle) => (
                          <option key={cycle._id} value={cycle._id}>
                            {locale === "sr" ? cycle.titleSr : cycle.titleEn}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">{locale === "sr" ? "Izaberi lekciju" : "Choose lesson"}</span>
                      <select
                        value={selectedLessonId}
                        onChange={(event) => {
                          setSelectedLessonId(event.target.value);
                          markDirty();
                        }}
                        disabled={!selectedModuleId || availableLessons.length === 0}
                        className="min-h-11 w-full rounded-[12px] border border-line bg-paper-strong px-3 text-sm font-black text-ink transition focus:border-ink focus:ring-4 focus:ring-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-[#eef3f7] dark:disabled:bg-ink/10 disabled:text-muted"
                      >
                        <option value="">{locale === "sr" ? "Izaberi lekciju" : "Choose a lesson"}</option>
                        {availableLessons.map((lesson) => (
                          <option key={lesson._id} value={lesson._id}>
                            {locale === "sr" ? lesson.titleSr : lesson.titleEn}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                <p className="mt-2 text-xs font-semibold text-muted">
                  {locale === "sr" ? "Ako je tema vezana za konkretan deo kursa, dodaj i ciklus ili lekciju da bi je drugi lakše pronašli." : "If the topic belongs to a specific part of a course, add its cycle or lesson so others can find it."}
                </p>
              </div>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <label htmlFor="community-body" className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
                    {locale === "sr" ? "Sadržaj" : "Content"}
                  </label>
                  <span className="text-[11px] font-bold tabular-nums text-ink/40">{body.length}</span>
                </div>
                <textarea
                  id="community-body"
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setFieldErrors((current) => ({ ...current, body: undefined }));
                    markDirty();
                  }}
                  aria-invalid={Boolean(fieldErrors.body)}
                  aria-describedby={fieldErrors.body ? "community-body-error" : "community-body-help"}
                  placeholder={
                    locale === "sr"
                      ? "Dodaj kontekst, šta si već probao i kakav odgovor bi ti najviše pomogao…"
                      : "Add context, what you already tried, and what kind of answer would help most…"
                  }
                  rows={13}
                  maxLength={20_000}
                  className="mt-2 min-h-[320px] w-full resize-y rounded-[12px] border border-line bg-paper-strong px-4 py-3 text-base font-semibold leading-7 text-ink/85 transition placeholder:text-ink/30 focus:border-ink focus:ring-4 focus:ring-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
                {fieldErrors.body ? (
                  <p id="community-body-error" className="mt-2 text-xs font-bold text-red-700">{fieldErrors.body}</p>
                ) : (
                  <p id="community-body-help" className="mt-2 text-xs font-semibold text-muted">
                    {locale === "sr" ? "Dobar kontekst vodi do preciznijih i korisnijih odgovora." : "Good context leads to more precise and useful answers."}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <label htmlFor="community-image" className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
                    {locale === "sr" ? "Slika (opciono)" : "Image (optional)"}
                  </label>
                  {imageFileName ? <span className="max-w-[50%] truncate text-[11px] font-bold text-ink/45">{imageFileName}</span> : null}
                </div>
                <input
                  id="community-image"
                  type="file"
                  ref={fileInputRef}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                    event.target.value = "";
                  }}
                  accept="image/*"
                  className="sr-only"
                />

                {imagePreviewUrl ? (
                  <div className="mt-2 rounded-[16px] border border-line bg-paper/55 p-3">
                    <div className="overflow-hidden rounded-[8px] bg-paper-strong">
                      <Image
                        src={imagePreviewUrl}
                        alt={locale === "sr" ? "Pregled priložene slike" : "Attachment preview"}
                        width={1280}
                        height={800}
                        unoptimized
                        className="h-auto max-h-96 w-full rounded-[8px] object-contain"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink transition hover:border-ink"
                      >
                        <ImagePlus className="size-4" />
                        {locale === "sr" ? "Zameni sliku" : "Replace image"}
                      </button>
                      {imagePreviewUrl !== initialPost?.imageUrl ? (
                        <button
                          type="button"
                          onClick={restoreOriginalImage}
                          className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-black text-ink/60 transition hover:bg-paper-strong hover:text-ink"
                        >
                          {initialPost?.imageUrl
                            ? locale === "sr"
                              ? "Vrati original"
                              : "Restore original"
                            : locale === "sr"
                              ? "Ukloni novu sliku"
                              : "Remove new image"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="mt-2 flex min-h-36 w-full flex-col items-center justify-center rounded-[16px] border border-dashed border-line bg-paper/45 p-6 text-center transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
                  >
                    {uploadingImage ? <Loader2 className="size-7 animate-spin text-ink/55" /> : <ImagePlus className="size-7 text-ink/50" />}
                    <span className="mt-2 text-sm font-black text-ink">
                      {uploadingImage
                        ? locale === "sr"
                          ? "Otpremanje slike…"
                          : "Uploading image…"
                        : locale === "sr"
                          ? "Izaberi ili prevuci sliku bilo gde"
                          : "Choose or drag an image anywhere"}
                    </span>
                    <span className="mt-1 text-xs font-semibold text-muted">PNG, JPG, WebP</span>
                  </button>
                )}
                {fieldErrors.image ? <p className="mt-2 text-xs font-bold text-red-700">{fieldErrors.image}</p> : null}
              </div>
            </div>
          </Panel>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <Panel className="rounded-[16px] border border-line bg-paper-strong p-4 shadow-none">
            <p className="font-display text-lg text-ink">{locale === "sr" ? "Pre objave" : "Before publishing"}</p>
            <h2 className="mt-1 text-lg font-black text-ink">{locale === "sr" ? "Brza provera" : "Quick check"}</h2>
            <ul className="mt-4 space-y-3 text-sm font-semibold leading-5 text-ink/70">
              <ChecklistItem done={Boolean(title.trim())} label={locale === "sr" ? "Jasan naslov" : "Clear title"} />
              <ChecklistItem done={Boolean(body.trim())} label={locale === "sr" ? "Dovoljno konteksta" : "Enough context"} />
              <ChecklistItem done label={locale === "sr" ? "Bez privatnih podataka" : "No private information"} />
            </ul>
            <div className="mt-5 rounded-[12px] border border-line bg-paper/55 p-3 text-xs font-semibold leading-5 text-ink/65">
              {isStaff
                ? locale === "sr"
                  ? "Tvoja tema se objavljuje odmah, bez provere."
                  : "Your topic is published immediately, without review."
                : locale === "sr"
                  ? "Kad pošalješ, moderator prvo pročita temu pa je objavi."
                  : "Once you send it, a moderator reads the topic and then publishes it."}
            </div>
          </Panel>
        </aside>
      </div>

      <div className="sticky bottom-3 z-30 rounded-[16px] border-2 border-ink bg-paper-strong/95 p-3 shadow-[5px_5px_0_var(--shadow-hard-16)] backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="mb-3 min-w-0 sm:mb-0">
          <p className="text-xs font-black uppercase tracking-[0.06em] text-ink/45">{statusText(currentStatus, locale)}</p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink">
            {title.trim() || (locale === "sr" ? "Tema bez naslova" : "Untitled topic")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === "edit" ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={pending}
              aria-label={locale === "sr" ? "Obriši temu" : "Delete topic"}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-red-200 bg-paper-strong px-3 text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleSubmit("draft")}
            disabled={pending || uploadingImage}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {locale === "sr" ? "Sačuvaj skicu" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(isStaff ? "published" : "pending")}
            disabled={pending || uploadingImage}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0.5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {isStaff
              ? locale === "sr"
                ? "Objavi temu"
                : "Publish topic"
              : currentStatus === "changes_requested"
                ? locale === "sr"
                  ? "Ponovo pošalji"
                  : "Resubmit"
                : locale === "sr"
                  ? "Pošalji na odobrenje"
                  : "Submit for review"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={locale === "sr" ? "Obrisati temu?" : "Delete topic?"}
        description={
          locale === "sr"
            ? "Tema i svi komentari biće trajno obrisani. Ovo ne može da se vrati."
            : "The topic and all its comments will be permanently deleted. This cannot be undone."
        }
        confirmLabel={locale === "sr" ? "Obriši temu" : "Delete topic"}
        cancelLabel={locale === "sr" ? "Odustani" : "Cancel"}
        closeLabel={locale === "sr" ? "Zatvori dijalog" : "Close dialog"}
        busy={pending}
        destructive
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function SaveIndicator({ locale, state, lastSavedAt }: { locale: Locale; state: SaveState; lastSavedAt: number | null }) {
  const label =
    state === "dirty"
      ? locale === "sr"
        ? "Nesačuvane izmene"
        : "Unsaved changes"
      : state === "saving"
        ? locale === "sr"
          ? "Čuvanje…"
          : "Saving…"
        : state === "saved_server"
          ? locale === "sr"
            ? "Sačuvano u skicama"
            : "Saved to drafts"
          : state === "saved_local"
            ? locale === "sr"
              ? "Sačuvano na uređaju"
              : "Saved on this device"
            : state === "error"
              ? locale === "sr"
                ? "Nije sačuvano automatski"
                : "Automatic saving failed"
              : locale === "sr"
                ? "Čuva se automatski"
                : "Saved automatically";

  return (
    <p
      role="status"
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border bg-paper-strong px-3 text-xs font-black",
        state === "error" ? "border-red-200 text-red-700" : "border-line text-ink/60",
      )}
      title={lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString(locale === "sr" ? "sr-RS" : "en-US") : undefined}
    >
      {state === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : state === "saved_local" || state === "saved_server" ? <CloudCheck className="size-3.5" /> : <Cloud className="size-3.5" />}
      {label}
    </p>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
          done ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-line bg-paper-strong text-transparent",
        )}
      >
        <CheckCircle2 className="size-3.5" />
      </span>
      {label}
    </li>
  );
}

function statusText(status: EditorStatus, locale: Locale) {
  if (status === "draft") return locale === "sr" ? "Skica" : "Draft";
  if (status === "pending") return locale === "sr" ? "Na odobrenju" : "Pending review";
  if (status === "changes_requested") return locale === "sr" ? "Potrebne izmene" : "Changes requested";
  return locale === "sr" ? "Objavljeno" : "Published";
}
