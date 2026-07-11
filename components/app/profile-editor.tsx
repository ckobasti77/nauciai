/* eslint-disable @next/next/no-img-element */
"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CheckCircle2,
  Globe2,
  ImagePlus,
  KeyRound,
  Loader2,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { api } from "@/convex/_generated/api";
import type { ViewerProfile } from "@/lib/current-viewer";
import { type Locale, withLocale } from "@/lib/i18n";
import {
  type ProfileAvatarPresetId,
  profileAvatarPresetSrc,
  profileAvatarPresets,
} from "@/lib/profile-avatars";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MASKED_PASSWORD = "**********";

type ViewerData = {
  profile?: ViewerProfile;
} | null;

function splitName(name: string, email: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const fallback = email.split("@")[0] || "Student";

  return {
    firstName: parts[0] || fallback,
    lastName: parts.slice(1).join(" "),
  };
}

function valuesFromProfile(profile: ViewerProfile, locale: Locale) {
  const email = profile?.email ?? "student@nauci.ai";
  const parts = splitName(profile?.name ?? email.split("@")[0] ?? "Student", email);
  const firstName = profile?.firstName ?? parts.firstName;
  const lastName = profile?.lastName ?? parts.lastName;
  const avatarPreset = profile?.avatarPreset;

  return {
    firstName,
    lastName,
    email,
    role: profile?.role ?? "student",
    language: profile?.language ?? locale,
    avatarPreset,
    username: profile?.username ?? "",
    avatarUrl:
      profile?.avatarUrl ??
      profileAvatarPresetSrc(avatarPreset) ??
      profileAvatarPresets[0].src,
  };
}

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function hasAvatarCandidateDrag(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return false;

  const items = Array.from(dataTransfer.items ?? []);
  if (items.length > 0) {
    return items.some((item) => item.kind === "file" && (!item.type || item.type.startsWith("image/")));
  }

  const types = Array.from(dataTransfer.types ?? []);
  return types.includes("Files") || (dataTransfer.files?.length ?? 0) > 0;
}

export function ProfileEditor({
  locale,
  initialProfile,
}: {
  locale: Locale;
  initialProfile?: ViewerProfile;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const liveViewer = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip") as ViewerData | undefined;
  const createAvatarUploadUrl = useMutation(api.profiles.createAvatarUploadUrl);
  const updateViewerProfile = useMutation(api.profiles.updateViewerProfile);
  const submitPost = useMutation(api.community.submitPost);

  const profile = liveViewer?.profile ?? initialProfile ?? null;
  const initialValues = useMemo(() => valuesFromProfile(profile, locale), [profile, locale]);

  const [firstName, setFirstName] = useState(initialValues.firstName);
  const [lastName, setLastName] = useState(initialValues.lastName);
  const [username, setUsername] = useState(initialValues.username);
  const [language, setLanguage] = useState<Locale>(initialValues.language);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(initialValues.avatarUrl);
  const [selectedPreset, setSelectedPreset] = useState<ProfileAvatarPresetId | undefined>(
    initialValues.avatarPreset,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const avatarSrc =
    filePreviewUrl ??
    (selectedPreset ? profileAvatarPresetSrc(selectedPreset) : undefined) ??
    currentAvatarUrl;
  const resetHref = `${withLocale(locale, "/sign-in")}?mode=reset&email=${encodeURIComponent(initialValues.email)}`;
  const resumePostId = searchParams.get("resumePostId");
  const requestedReturnTo = searchParams.get("returnTo");
  const resumeReturnTo =
    requestedReturnTo?.startsWith(`${withLocale(locale, "/app/community/")}`)
      ? requestedReturnTo
      : resumePostId
        ? withLocale(locale, `/app/community/${resumePostId}/edit`)
        : null;

  function validateAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) {
      throw new Error(labelFor(locale, "Avatar mora da bude slika.", "Avatar must be an image."));
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error(labelFor(locale, "Avatar mora da bude manji od 5MB.", "Avatar must be smaller than 5MB."));
    }
  }

  function chooseFile(file: File) {
    try {
      validateAvatarFile(file);
      const previewUrl = URL.createObjectURL(file);
      setSelectedFile(file);
      setFilePreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return previewUrl;
      });
      setSelectedPreset(undefined);
      setAvatarChanged(true);
      setMessage({
        tone: "success",
        text: labelFor(
          locale,
          "Slika je spremna. Sacuvaj izmene da postavis novi avatar.",
          "Image ready. Save changes to apply your new avatar.",
        ),
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : labelFor(locale, "Upload nije uspeo.", "Upload failed."),
      });
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      chooseFile(file);
    }
    event.currentTarget.value = "";
  }

  const applyDroppedFile = useEffectEvent((file: File) => {
    chooseFile(file);
  });

  useEffect(() => {
    function resetDragging() {
      dragDepthRef.current = 0;
      setDragging(false);
    }

    function handleWindowDragEnter(event: globalThis.DragEvent) {
      if (!hasAvatarCandidateDrag(event.dataTransfer)) return;

      event.preventDefault();
      dragDepthRef.current += 1;
      setDragging(true);
    }

    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (!hasAvatarCandidateDrag(event.dataTransfer)) return;

      event.preventDefault();
      setDragging(true);
    }

    function handleWindowDragLeave() {
      if (dragDepthRef.current === 0) return;

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragging(false);
      }
    }

    function handleWindowDrop(event: globalThis.DragEvent) {
      if (!hasAvatarCandidateDrag(event.dataTransfer) && dragDepthRef.current === 0) return;

      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      resetDragging();
      if (file) {
        applyDroppedFile(file);
      }
    }

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  function handleDrop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      chooseFile(file);
    }
  }

  function handleDragOver(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    if (hasAvatarCandidateDrag(event.dataTransfer)) {
      setDragging(true);
    }
  }

  function selectPreset(id: ProfileAvatarPresetId) {
    setSelectedPreset(id);
    setSelectedFile(null);
    setFilePreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setAvatarChanged(true);
    setMessage(null);
  }

  async function uploadAvatarFile() {
    if (!selectedFile) return undefined;

    const uploadUrl = await createAvatarUploadUrl();
    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
      body: selectedFile,
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => "");
      throw new Error(
        detail
          ? `${labelFor(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 220)}`
          : labelFor(locale, "Upload nije uspeo.", "Upload failed."),
      );
    }

    const result = (await upload.json()) as { storageId?: Id<"_storage"> };
    if (!result.storageId) {
      throw new Error(labelFor(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
    }
    return result.storageId;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    let profileSaved = false;

    try {
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      if (!trimmedFirstName || !trimmedLastName) {
        throw new Error(labelFor(locale, "Ime i prezime su obavezni.", "First and last name are required."));
      }

      const avatarStorageId = await uploadAvatarFile();
      const updatedProfile = (await updateViewerProfile({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        language,
        username: username.trim(),
        ...(avatarStorageId
          ? { avatarStorageId }
          : avatarChanged && selectedPreset
            ? { avatarPreset: selectedPreset }
            : {}),
      })) as ViewerProfile;
      if (updatedProfile?.avatarUrl) {
        setCurrentAvatarUrl(updatedProfile.avatarUrl);
      }
      if (updatedProfile?.avatarPreset) {
        setSelectedPreset(updatedProfile.avatarPreset);
      }
      profileSaved = true;

      if (resumePostId) {
        const resumed = await submitPost({ postId: resumePostId as Id<"communityPosts"> });
        const destination =
          resumed.status === "published"
            ? resumeReturnTo?.replace(/\/edit$/, "") ?? withLocale(locale, `/app/community/${resumePostId}`)
            : withLocale(locale, "/app/community/my-threads?view=pending&submitted=1");
        toast.success(
          resumed.status === "published"
            ? labelFor(locale, "Profil je sačuvan i tred je objavljen.", "Profile saved and thread published.")
            : labelFor(locale, "Profil je sačuvan i tred je poslat na odobrenje.", "Profile saved and thread submitted for review."),
        );
        router.push(destination);
        router.refresh();
        return;
      }
      setAvatarChanged(false);
      setSelectedFile(null);
      setFilePreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      setMessage({
        tone: "success",
        text: labelFor(locale, "Profil je sacuvan.", "Profile saved."),
      });
      toast.success(labelFor(locale, "Profil je sačuvan.", "Profile saved."));
      router.refresh();
    } catch (error) {
      toast.error(
        profileSaved
          ? labelFor(locale, "Profil je sačuvan, ali nastavak nije uspeo.", "Profile saved, but the next action failed.")
          : labelFor(locale, "Čuvanje profila nije uspelo.", "Profile save failed."),
      );
      setMessage({
        tone: "error",
        text: profileSaved
          ? error instanceof Error
            ? labelFor(locale, `Profil je sačuvan, ali nastavak objave nije uspeo: ${error.message}`, `Profile saved, but publishing could not continue: ${error.message}`)
            : labelFor(locale, "Profil je sačuvan, ali nastavak objave nije uspeo.", "Profile saved, but publishing could not continue.")
          : error instanceof Error
            ? error.message
            : labelFor(locale, "Čuvanje nije uspelo.", "Save failed."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div className="absolute inset-4 rounded-[28px] border-[3px] border-dashed border-yellow bg-ink/45 backdrop-blur-[3px]" />
          <div className="absolute left-1/2 top-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border-[3px] border-ink bg-yellow p-6 text-center shadow-[10px_10px_0_0_rgba(255,255,255,0.95)]">
            <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink">
              <UploadCloud className="size-8" />
            </span>
            <p className="mt-4 text-2xl font-black leading-tight text-ink">
              {labelFor(locale, "Pusti sliku bilo gde da postavis avatar", "Drop anywhere to set your avatar")}
            </p>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/80">
              {labelFor(
                locale,
                "Ceo ekran je aktivan. Kada pustis sliku, odmah ce se prikazati kao novi avatar.",
                "The whole screen is active. When you release the image, it will immediately preview as your new avatar.",
              )}
            </p>
          </div>
        </div>
      ) : null}
      {!username.trim() ? (
        <div role="status" className="flex items-start gap-3 rounded-[16px] border-2 border-ink bg-yellow/30 px-4 py-3 text-sm font-bold text-ink">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-black">
              {resumePostId
                ? labelFor(locale, "Podesi username da nastaviš objavu skice.", "Set a username to continue publishing this draft.")
                : labelFor(locale, "Profil nije kompletan za rad u Zajednici.", "Your profile is not complete for Community yet.")}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-ink/75">
              {labelFor(locale, "Username je jedini obavezni podatak i koristi se za @pominjanja.", "Username is the only required field and powers @mentions.")}
            </p>
          </div>
        </div>
      ) : null}
      <SectionHeader
        title={labelFor(locale, "Profil", "Profile")}
        body={labelFor(
          locale,
          "Uredi ime, prezime, avatar i osnovna podesavanja naloga. Sliku mozes da prevuces bilo gde na ovoj stranici.",
          "Edit your name, avatar, and basic account settings. You can drag an image anywhere on this page.",
        )}
      />

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(360px,0.42fr)]">
        <Panel className="overflow-hidden">
          <div className="border-b-2 border-ink bg-yellow px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase text-ink/75">
                  {labelFor(locale, "Javni identitet", "Public identity")}
                </p>
                <h2 className="mt-1 text-3xl font-black leading-tight text-ink">
                  {[firstName, lastName].filter(Boolean).join(" ") || initialValues.email}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-black uppercase text-ink">
                <span className="inline-flex items-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2">
                  <ShieldCheck className="size-4" />
                  {initialValues.role}
                </span>
                <span className="inline-flex items-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2">
                  <Globe2 className="size-4" />
                  {language.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                  "group relative mx-auto flex size-44 items-center justify-center overflow-hidden rounded-full border-[3px] border-ink bg-paper shadow-[7px_7px_0_0_rgba(14,49,88,0.18)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
                  dragging && "scale-[1.02] border-yellow bg-yellow/25",
                )}
                aria-label={labelFor(locale, "Upload avatar slike", "Upload avatar image")}
              >
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex flex-col items-center justify-center bg-ink/72 px-6 text-center text-sm font-black text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  <UploadCloud className="mb-2 size-7" />
                  {labelFor(locale, "Prevuci sliku ovde", "Drop image here")}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-center text-sm font-bold leading-6 text-muted">
                {labelFor(
                  locale,
                  "Klikni ili prevuci sliku bilo gde na ovoj stranici. PNG, JPG ili WebP do 5MB.",
                  "Click or drop an image anywhere on this page. PNG, JPG, or WebP up to 5MB.",
                )}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-ink">{labelFor(locale, "Ime", "First name")}</span>
                <input
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                  }}
                  className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/25"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-ink">{labelFor(locale, "Prezime", "Last name")}</span>
                <input
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                  }}
                  className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/25"
                  required
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-black text-ink">Email</span>
                <input
                  value={initialValues.email}
                  readOnly
                  className="mt-2 h-12 w-full rounded-[8px] border-2 border-line bg-paper px-4 text-base font-extrabold text-muted outline-none"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-black text-ink">{labelFor(locale, "Korisnicko ime (Jedinstveno)", "Username (Unique)")}</span>
                <div className="relative mt-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-black text-ink/45">@</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="h-12 w-full rounded-[8px] border-2 border-ink bg-white pl-8 pr-4 text-base font-extrabold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/25"
                    placeholder="npr. jovan_m"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {labelFor(locale, "Korisnicko ime mora imati izmedju 3 i 20 karaktera i moze sadrzati samo slova, brojeve, donje crte i crtice. Koristi se za pominjanje u zajednici (@username).", "Username must be between 3 and 20 characters and contain only letters, numbers, underscores, and hyphens. Used for mentions (@username).")}
                </p>
              </label>
              <div className="sm:col-span-2">
                <span className="text-sm font-black text-ink">{labelFor(locale, "Lozinka", "Password")}</span>
                <div className="mt-2 flex min-h-12 flex-col gap-3 rounded-[8px] border-2 border-line bg-paper px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-mono text-base font-black text-ink">{MASKED_PASSWORD}</span>
                  <Link href={resetHref} className="inline-flex items-center gap-2 text-sm font-black text-blue-700 underline">
                    <KeyRound className="size-4" />
                    Reset password
                  </Link>
                </div>
              </div>
              <label className="block sm:col-span-2">
                <span className="text-sm font-black text-ink">{labelFor(locale, "Jezik platforme", "Platform language")}</span>
                <select
                  value={language}
                  onChange={(event) => {
                    setLanguage(event.target.value as Locale);
                  }}
                  className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/25"
                >
                  <option value="sr">Srpski</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
          </div>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink">
              <UserRound className="size-5" />
            </span>
            <div>
              <h3 className="text-xl font-black text-ink">
                {labelFor(locale, "Izaberi avatar", "Choose an avatar")}
              </h3>
              <p className="mt-1 text-sm font-bold leading-6 text-muted">
                {labelFor(
                  locale,
                  "Tri gotova lika ili prevuci svoju sliku bilo gde na ekranu.",
                  "Three ready-made characters or drag your own image anywhere on the screen.",
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {profileAvatarPresets.map((preset) => {
              const selected = selectedPreset === preset.id && !selectedFile;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset.id)}
                  className={cn(
                    "group min-h-36 rounded-[8px] border-2 bg-white p-3 text-left transition hover:-translate-y-0.5",
                    selected
                      ? "border-ink shadow-[5px_5px_0_0_#f4be30]"
                      : "border-line shadow-[3px_3px_0_0_rgba(14,49,88,0.08)] hover:border-ink",
                  )}
                >
                  <span className="relative mx-auto flex size-20 overflow-hidden rounded-full border-2 border-ink bg-paper">
                    <img src={preset.src} alt="" className="h-full w-full object-cover" />
                    {selected ? (
                      <span className="absolute right-0 top-0 rounded-full border-2 border-ink bg-yellow p-0.5">
                        <CheckCircle2 className="size-4 text-ink" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-3 block text-center text-sm font-black text-ink">
                    {labelFor(locale, preset.labelSr, preset.labelEn)}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={cn(
                "flex min-h-36 flex-col items-center justify-center rounded-[8px] border-2 border-dashed bg-paper p-3 text-center transition hover:-translate-y-0.5 hover:border-ink",
                selectedFile ? "border-ink shadow-[5px_5px_0_0_#f4be30]" : "border-line",
                dragging && "border-yellow bg-yellow/25",
              )}
            >
              <span className="inline-flex size-16 items-center justify-center rounded-full border-2 border-ink bg-white text-ink">
                <ImagePlus className="size-7" />
              </span>
              <span className="mt-3 text-sm font-black text-ink">
                {selectedFile ? selectedFile.name : labelFor(locale, "Dodaj svoju", "Upload yours")}
              </span>
            </button>
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="submit"
              disabled={pending || isLoading || !isAuthenticated}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-5 py-2.5 text-sm font-extrabold text-white shadow-[4px_4px_0_0_#f4be30] transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {labelFor(locale, "Sacuvaj izmene", "Save changes")}
            </button>
            {message ? (
              <p
                role="status"
                aria-live="polite"
                className={cn(
                  "rounded-[8px] border-2 px-3 py-2 text-sm font-black",
                  message.tone === "success"
                    ? "border-ink bg-yellow/30 text-ink"
                    : "border-red-700 bg-red-50 text-red-700",
                )}
              >
                {message.text}
              </p>
            ) : null}
          </div>
        </Panel>
      </form>
    </div>
  );
}
