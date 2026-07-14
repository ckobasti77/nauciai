/* eslint-disable @next/next/no-img-element */
"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CheckCircle2,
  CircleAlert,
  Globe2,
  ImagePlus,
  KeyRound,
  Loader2,
  MailCheck,
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
import {
  isValidUsername,
  USERNAME_VALIDATION_MESSAGE_EN,
  USERNAME_VALIDATION_MESSAGE_SR,
} from "@/lib/username-policy";
import { type Locale, withLocale } from "@/lib/i18n";
import { passwordRequirements, passwordValidationErrors } from "@/lib/password-policy";
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
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const liveViewer = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip") as ViewerData | undefined;
  const profileStatus = useQuery(api.profiles.getViewerProfileStatus, isAuthenticated ? {} : "skip");
  const createAvatarUploadUrl = useMutation(api.profiles.createAvatarUploadUrl);
  const updateViewerProfile = useMutation(api.profiles.updateViewerProfile);
  const setViewerPassword = useAction(api.auth.setViewerPassword);
  const changeViewerPassword = useAction(api.auth.changeViewerPassword);
  const requestViewerEmailVerification = useAction(api.emailVerification.requestViewerEmailVerification);
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
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const shouldFocusUsername = searchParams.get("focus") === "username";

  useEffect(() => {
    if (!shouldFocusUsername || profileStatus === undefined) return;
    const input = usernameInputRef.current;
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => input.focus({ preventScroll: true }), 250);
    return () => window.clearTimeout(timer);
  }, [profileStatus, shouldFocusUsername]);

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
  const onboardingReturnTo =
    requestedReturnTo &&
    (requestedReturnTo.startsWith(`${withLocale(locale, "/app/")}`) || requestedReturnTo.startsWith(`${withLocale(locale, "/community/")}`)) &&
    requestedReturnTo !== withLocale(locale, "/app/profile")
      ? requestedReturnTo
      : null;
  const resumeReturnTo =
    requestedReturnTo?.startsWith(`${withLocale(locale, "/app/community/")}`)
      ? requestedReturnTo
      : resumePostId
        ? withLocale(locale, `/app/community/${resumePostId}/edit`)
        : null;

  async function requestEmailVerification() {
    setVerificationPending(true);
    setVerificationMessage(null);
    try {
      const result = await requestViewerEmailVerification({ locale });
      if (!result.sent) {
        setVerificationMessage({
          tone: "error",
          text: labelFor(
            locale,
            result.code === "not_configured"
              ? "Slanje emaila trenutno nije podešeno. Administrator je obavešten."
              : "Email provajder trenutno nije prihvatio poruku. Pokušaj ponovo malo kasnije.",
            result.code === "not_configured"
              ? "Email delivery is not configured right now. The administrator has been notified."
              : "The email provider did not accept the message. Please try again shortly.",
          ),
        });
        return;
      }
      setVerificationMessage({
        tone: "success",
        text: labelFor(
          locale,
          "Poslali smo verifikacioni link na tvoj email. Link važi 30 minuta.",
          "We sent a verification link to your email. The link is valid for 30 minutes.",
        ),
      });
    } catch {
      setVerificationMessage({
        tone: "error",
        text: labelFor(
          locale,
          "Verifikacioni email nije poslat. Proveri vezu i pokušaj ponovo.",
          "The verification email was not sent. Check your connection and try again.",
        ),
      });
    } finally {
      setVerificationPending(false);
    }
  }

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
    let passwordActionAttempted = false;

    try {
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      if (!trimmedFirstName || !trimmedLastName) {
        throw new Error(labelFor(locale, "Ime i prezime su obavezni.", "First and last name are required."));
      }

      const wantsNewPassword = Boolean(newPassword || confirmPassword);
      const needsPassword = profileStatus?.hasPassword === false && wantsNewPassword;
      const changingPassword = profileStatus?.hasPassword === true && changePasswordOpen;
      passwordActionAttempted = needsPassword || changingPassword;
      if (needsPassword || changingPassword || newPassword || confirmPassword) {
        const missingRequirement = passwordValidationErrors(newPassword)[0];
        if (missingRequirement) {
          throw new Error(
            labelFor(
              locale,
              `Lozinka mora da sadrži: ${missingRequirement.labelSr.toLowerCase()}.`,
              `Password must include: ${missingRequirement.labelEn.toLowerCase()}.`,
            ),
          );
        }
        if (newPassword !== confirmPassword) {
          throw new Error(labelFor(locale, "Lozinke se ne poklapaju.", "Passwords do not match."));
        }
      }

      const avatarStorageId = await uploadAvatarFile();
      if (username.trim() && !isValidUsername(username.trim())) {
        throw new Error(labelFor(locale, USERNAME_VALIDATION_MESSAGE_SR, USERNAME_VALIDATION_MESSAGE_EN));
      }
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

      if (needsPassword) {
        await setViewerPassword({ password: newPassword });
        setNewPassword("");
        setConfirmPassword("");
        setChangePasswordOpen(false);
      } else if (changingPassword) {
        await changeViewerPassword({ password: newPassword });
        setNewPassword("");
        setConfirmPassword("");
        setChangePasswordOpen(false);
      }

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
      if (onboardingReturnTo && username.trim()) {
        router.push(onboardingReturnTo);
      }
    } catch (error) {
      if (passwordActionAttempted) {
        const detail = error instanceof Error ? error.message : labelFor(locale, "Greška pri čuvanju lozinke.", "Password save failed.");
        toast.error(labelFor(locale, "Profil je sačuvan, ali lozinka nije sačuvana.", "Profile saved, but the password was not saved."));
        setMessage({
          tone: "error",
          text: labelFor(locale, `Profil je sačuvan, ali lozinka nije sačuvana: ${detail}`, `Profile saved, but the password was not saved: ${detail}`),
        });
        return;
      }
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
        <div role="status" className="flex items-start gap-3 rounded-[16px] border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-950">
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
      {profileStatus && !profileStatus.hasEmail ? (
        <div role="status" className="flex items-start gap-3 rounded-[16px] border-2 border-amber-700 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-black">{labelFor(locale, "Email adresa nije dostupna za verifikaciju.", "No email address is available for verification.")}</p>
            <p className="mt-1 text-xs font-semibold leading-5">{labelFor(locale, "Dodaj ili obnovi nalog sa email adresom da bi mogao/la da postaviš lozinku.", "Add or restore an account with an email address before setting a password.")}</p>
          </div>
        </div>
      ) : null}
      {profileStatus?.advisories?.emailVerification ? (
        <div role="status" className="flex items-start gap-3 rounded-[16px] border-2 border-amber-700 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
          <MailCheck className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-black">{labelFor(locale, "Email još nije potvrđen za pristup kursevima.", "Your email is not yet verified for course access.")}</p>
            <p className="mt-1 text-xs font-semibold leading-5">{labelFor(locale, "Verifikacija blokira checkout i lekcije, ali ne blokira dashboard, javni pregled kurseva ili Community.", "Verification blocks checkout and lessons, but not the dashboard, public course pages, or Community.")}</p>
            <button
              type="button"
              onClick={requestEmailVerification}
              disabled={verificationPending}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_#0e3158] transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              {verificationPending ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}
              {labelFor(locale, "Pošalji verifikacioni link", "Send verification link")}
            </button>
            {verificationMessage ? (
              <p className={cn("mt-2 text-xs font-black", verificationMessage.tone === "success" ? "text-emerald-700" : "text-red-700")}>
                {verificationMessage.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {profileStatus?.advisories?.password ? (
        <div role="status" className="flex items-start gap-3 rounded-[16px] border-2 border-indigo-700 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-950">
          <KeyRound className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-black">{labelFor(locale, "Lozinka nije postavljena.", "No password is set yet.")}</p>
            <p className="mt-1 text-xs font-semibold leading-5">{labelFor(locale, "Ovo je opciona preporuka; prvo potvrdi email ako želiš da dodaš password prijavu.", "This is optional; verify your email first if you want to add password sign-in.")}</p>
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
                    ref={usernameInputRef}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    maxLength={20}
                    pattern="[A-Za-zČĆŠĐŽčćšđž0-9._]{3,20}"
                    className="h-12 w-full rounded-[8px] border-2 border-ink bg-white pl-8 pr-4 text-base font-extrabold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/25"
                    placeholder="npr. jovan_m"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {labelFor(locale, "Korisničko ime mora imati između 3 i 20 znakova, najmanje 3 slova, i može sadržati samo slova, cifre, tačku i donju crtu. Koristi se za pominjanje u zajednici (@username).", "Username must be 3–20 characters, contain at least 3 letters, and use only letters, numbers, periods, and underscores. Used for mentions (@username).")}
                </p>
              </label>
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-black text-ink">{labelFor(locale, "Lozinka", "Password")}</span>
                  {profileStatus?.hasPassword ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => setChangePasswordOpen((value) => { if (value) { setNewPassword(""); setConfirmPassword(""); } return !value; })} className="inline-flex items-center gap-2 text-sm font-black text-blue-700 underline">
                        <KeyRound className="size-4" />
                        {labelFor(locale, changePasswordOpen ? "Otkaži promenu" : "Promeni lozinku", changePasswordOpen ? "Cancel password change" : "Change password")}
                      </button>
                      <Link href={resetHref} className="text-xs font-black text-muted underline">
                        {labelFor(locale, "Email reset", "Email reset")}
                      </Link>
                    </div>
                  ) : null}
                </div>
                {profileStatus?.hasPassword ? (
                  <>
                    <div className="mt-2 flex min-h-12 items-center rounded-[8px] border-2 border-line bg-paper px-4 py-3">
                      <span className="font-mono text-base font-black text-ink">{MASKED_PASSWORD}</span>
                    </div>
                    {changePasswordOpen ? (
                      <div className="mt-2 space-y-3 rounded-[8px] border-2 border-ink bg-paper p-4">
                        <label className="block">
                          <span className="text-xs font-black uppercase text-ink/70">{labelFor(locale, "Nova lozinka", "New password")}</span>
                          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none focus:border-yellow" />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black uppercase text-ink/70">{labelFor(locale, "Potvrdi lozinku", "Confirm password")}</span>
                          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none focus:border-yellow" />
                        </label>
                        <div className="grid gap-1 text-xs font-bold text-muted sm:grid-cols-2">
                          {passwordRequirements.map((requirement) => (
                            <span key={requirement.id} className={requirement.test(newPassword) ? "text-emerald-700" : "text-muted"}>
                              {requirement.test(newPassword) ? "✓" : "•"} {labelFor(locale, requirement.labelSr, requirement.labelEn)}
                            </span>
                          ))}
                        </div>
                        {confirmPassword && newPassword !== confirmPassword ? <p className="text-xs font-black text-red-700">{labelFor(locale, "Lozinke se ne poklapaju.", "Passwords do not match.")}</p> : null}
                      </div>
                    ) : null}
                  </>
                ) : profileStatus?.emailVerifiedForCourses === false ? (
                  <div className="mt-2 space-y-3 rounded-[8px] border-2 border-amber-700 bg-amber-50 p-4 text-amber-950">
                    <p className="text-sm font-bold">
                      {labelFor(locale, "Potvrdi email klikom na link koji smo poslali. Polja za lozinku će se pojaviti nakon potvrde.", "Confirm your email using the link we sent. Password fields will appear after confirmation.")}
                    </p>
                    <button
                      type="button"
                      onClick={requestEmailVerification}
                      disabled={verificationPending || !profileStatus?.hasEmail}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_#0e3158] transition hover:-translate-y-0.5 disabled:opacity-60"
                    >
                      {verificationPending ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}
                      {labelFor(locale, "Pošalji ponovo", "Send again")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3 rounded-[8px] border-2 border-indigo-700 bg-indigo-50 p-4">
                    <p className="text-sm font-bold text-ink">
                      {labelFor(locale, "Postavi lozinku za ovaj nalog. Polja ostaju prazna dok ih sam ne uneseš.", "Set a password for this account. The fields stay empty until you enter them.")}
                    </p>
                    <label className="block">
                      <span className="text-xs font-black uppercase text-ink/70">{labelFor(locale, "Nova lozinka", "New password")}</span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                        className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none focus:border-yellow"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-black uppercase text-ink/70">{labelFor(locale, "Potvrdi lozinku", "Confirm password")}</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-extrabold text-ink outline-none focus:border-yellow"
                      />
                    </label>
                    <div className="grid gap-1 text-xs font-bold text-muted sm:grid-cols-2">
                      {passwordRequirements.map((requirement) => (
                        <span key={requirement.id} className={requirement.test(newPassword) ? "text-emerald-700" : "text-muted"}>
                          {requirement.test(newPassword) ? "✓" : "•"} {labelFor(locale, requirement.labelSr, requirement.labelEn)}
                        </span>
                      ))}
                    </div>
                    {confirmPassword && newPassword !== confirmPassword ? (
                      <p className="text-xs font-black text-red-700">{labelFor(locale, "Lozinke se ne poklapaju.", "Passwords do not match.")}</p>
                    ) : null}
                  </div>
                )}
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
              disabled={pending || isLoading || !isAuthenticated || profileStatus === undefined}
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
