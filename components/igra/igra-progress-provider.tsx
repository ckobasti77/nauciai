"use client";

import { useConvexAuth, useMutation, useQueries, type RequestForQueries } from "convex/react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { IgraProgressContext, type IgraProgress } from "@/components/igra/igra-progress-context";
import { api } from "@/convex/_generated/api";
import { withLocale, type Locale } from "@/lib/i18n";
import { publicProfilePath } from "@/lib/profile-links";

// Lenjo: slavlje i panel (slike, manifest, GSAP hookovi) ne ulaze u početni JS ljuske.
const CelebrationHost = dynamic(() => import("@/components/igra/celebration-host").then((mod) => mod.CelebrationHost), { ssr: false });
const ProgressPanel = dynamic(() => import("@/components/igra/progress-panel").then((mod) => mod.ProgressPanel), { ssr: false });

/**
 * Napredak IGRA-e za celu ljusku aplikacije (K06, plan K01 §6.1): JEDAN upit
 * `igra:getMyProgress` koji čitaju sidebar, zaglavlje i panel, domaćin slavlja i panel
 * „Moj napredak". Montira se samo u `AppShell`, pa slavlja nema na javnom sajtu.
 *
 * Novo neviđeno (nivo, bedž, kurs) domaćin slavi jednom i u trenutku prikaza javlja
 * `igra:markSeen`; red sesije u domaćinu ne dozvoljava dva slavlja odjednom.
 */
export function IgraProgressProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const todayKey = useBelgradeToday();
  const pathname = usePathname();

  // `useQueries`, ne `useQuery`: greška upita stiže kao vrednost umesto da sruši ljusku.
  // Napredak je ukras - ako ga nema, aplikacija radi bez njega.
  const queries = useMemo(() => {
    const request: RequestForQueries = {};
    if (isAuthenticated) request.progress = { query: api.igra.getMyProgress, args: { todayKey } };
    return request;
  }, [isAuthenticated, todayKey]);
  const result = useQueries(queries).progress as IgraProgress | null | undefined | Error;
  const progress = result instanceof Error ? null : isAuthenticated ? result : isLoading ? undefined : null;

  const markSeen = useMutation(api.igra.markSeen);
  const onSeen = useCallback((keys: string[]) => void markSeen({ keys }).catch(() => undefined), [markSeen]);

  // Domaćin se učitava tek kad ima šta da se slavi i posle toga ostaje montiran, da se
  // otvoreno slavlje ne ugasi čim `markSeen` isprazni `fresh`.
  const fresh = progress?.fresh;
  const hasFresh = Boolean(fresh && (fresh.level !== null || fresh.badges.length > 0 || fresh.courses.length > 0));
  const [hostMounted, setHostMounted] = useState(false);
  if (hasFresh && !hostMounted) setHostMounted(true);

  // Panel je otvoren samo na strani na kojoj je otvoren: prelazak na drugu ga zatvara.
  const [panelPath, setPanelPath] = useState<string | null>(null);
  const [panelLoaded, setPanelLoaded] = useState(false);
  const openPanel = useCallback(() => {
    setPanelLoaded(true);
    setPanelPath(pathname);
  }, [pathname]);
  const closePanel = useCallback(() => setPanelPath(null), []);

  const value = useMemo(() => ({ progress, openPanel }), [progress, openPanel]);

  return (
    <IgraProgressContext.Provider value={value}>
      {children}
      {hostMounted ? <CelebrationHost locale={locale} fresh={fresh} onSeen={onSeen} /> : null}
      {panelLoaded && progress ? (
        <ProgressPanel
          open={panelPath === pathname}
          onClose={closePanel}
          progress={progress}
          locale={locale}
          profileHref={withLocale(locale, publicProfilePath(progress.username))}
          leaderboardHref={withLocale(locale, "/app/community/leaderboard")}
        />
      ) : null}
    </IgraProgressContext.Provider>
  );
}
