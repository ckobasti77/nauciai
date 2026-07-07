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
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";

import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
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
    avatarUrl:
      profile?.avatarUrl ??
      profileAvatarPresetSrc(avatarPreset) ??
      profileAvatarPresets[0].src,
  };
}

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

export function ProfileEditor({
  locale,
  initialProfile,
}: {
  locale: Locale;
  initialProfile?: ViewerProfile;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const liveViewer = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip") as ViewerData | undefined;
  const createAvatarUploadUrl = useMutation(api.profiles.createAvatarUploadUrl);
  const updateViewerProfile = useMutation(api.profiles.updateViewerProfile);

  const profile = liveViewer?.profile ?? initialProfile ?? null;
  const initialValues = useMemo(() => valuesFromProfile(profile, locale), [profile, locale]);

  const [firstName, setFirstName] = useState(initialValues.firstName);
  const [lastName, setLastName] = useState(initialValues.lastName);
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
      setMessage(null);
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

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      chooseFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(true);
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
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : labelFor(locale, "Cuvanje nije uspelo.", "Save failed."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={labelFor(locale, "Profil", "Profile")}
        body={labelFor(
          locale,
          "Uredi ime, prezime, avatar i osnovna podesavanja naloga.",
          "Edit your name, avatar, and basic account settings.",
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
                onDragLeave={() => setDragging(false)}
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
                  "Klikni ili prevuci sliku direktno na avatar. PNG, JPG ili WebP do 5MB.",
                  "Click or drop an image directly onto the avatar. PNG, JPG, or WebP up to 5MB.",
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
                  "Tri gotova lika ili cetvrta opcija za upload tvoje slike.",
                  "Three ready-made characters or a fourth option to upload your own image.",
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
              onDragLeave={() => setDragging(false)}
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
