"use client";

import { Bell, BellOff } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { Spinner } from "@/components/ui/spinner";

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

type PushStatus = "unsupported" | "idle" | "subscribed" | "denied" | "pending";

function initialPushStatus(): PushStatus {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return Notification.permission === "denied" ? "denied" : "idle";
}

export function PushNotificationButton({ locale }: { locale: Locale }) {
  const config = useQuery(api.chat.getPushConfig, {});
  const registerSubscription = useMutation(api.chat.registerPushSubscription);
  const removeSubscription = useMutation(api.chat.removePushSubscription);
  const [status, setStatus] = useState<PushStatus>(initialPushStatus);

  useEffect(() => {
    if (status !== "idle" || !config?.enabled || !config.publicKey) return;
    let cancelled = false;
    void navigator.serviceWorker.register("/chat-push-sw.js").then(async (registration) => {
      if (!cancelled) setStatus((await registration.pushManager.getSubscription()) ? "subscribed" : "idle");
    }).catch(() => {
      if (!cancelled) setStatus("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, [config?.enabled, config?.publicKey, status]);

  const publicKey = config?.enabled ? config.publicKey : null;
  if (!publicKey || status === "unsupported") return null;

  async function toggle() {
    if (!publicKey) return;
    setStatus("pending");
    try {
      const registration = await navigator.serviceWorker.register("/chat-push-sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await removeSubscription({ endpoint: existing.endpoint });
        await existing.unsubscribe();
        setStatus("idle");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey),
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Push subscription keys are missing.");
      await registerSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        expiresAt: subscription.expirationTime ?? undefined,
        userAgent: navigator.userAgent,
      });
      setStatus("subscribed");
    } catch {
      setStatus(Notification.permission === "denied" ? "denied" : "idle");
    }
  }

  const title = status === "subscribed"
    ? (locale === "sr" ? "Isključi browser push" : "Disable browser push")
    : status === "denied"
      ? (locale === "sr" ? "Push je odbijen u browseru" : "Push is blocked in the browser")
      : (locale === "sr" ? "Uključi browser push" : "Enable browser push");

  return (
    <button type="button" onClick={() => void toggle()} disabled={status === "pending" || status === "denied"} className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper-strong disabled:opacity-50" aria-label={title} title={title}>
      {status === "pending" ? <Spinner /> : status === "subscribed" ? <Bell className="size-4 fill-current" /> : <BellOff className="size-4" />}
    </button>
  );
}
