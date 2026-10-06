"use client";

import type { FunctionArgs } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

export type CreateJobArgs = FunctionArgs<typeof api.studio.createJob>;

/** Server odbija posao samo zato što su mesta puna - to nije greška, posao čeka. */
const WAIT_CODES = ["PREVISE_POSLOVA", "MINUTNI_LIMIT"];
const RETRY_MS = 4000;

/**
 * Red poslova na klijentu (Crea K13: varijacije S5, probni list S4). Javni korisnik
 * ima najviše 2 posla u toku i 6 u minuti (`studioCore.PUBLIC_LIMIT_DEFAULTS`), pa se
 * posao koji server odbije sa „puno je" ponovo šalje za par sekundi, a sve ostale
 * greške prekidaju red. Svaki posao ide kroz isti `studio.createJob` (cena, limiti,
 * DEMO bez ključa) - red ne zaobilazi nijednu proveru.
 */
export function useJobQueue(onError: (message: string) => void) {
  const createJob = useCreaCreateJob();
  const queue = useRef<Array<{ args: CreateJobArgs; onCreated?: (jobId: Id<"generationJobs">) => void }>>([]);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [waiting, setWaiting] = useState(0);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      queue.current = [];
    },
    [],
  );

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length > 0) {
        const next = queue.current[0]!;
        try {
          const result = await createJob(next.args);
          queue.current.shift();
          setWaiting(queue.current.length);
          if (typeof result === "string") next.onCreated?.(result);
          else if (result && typeof result === "object" && "moderationBlocked" in result) {
            queue.current = [];
            setWaiting(0);
            errorRef.current(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (WAIT_CODES.some((code) => message.includes(code))) {
            timer.current = setTimeout(() => void pump(), RETRY_MS);
          } else {
            queue.current = [];
            setWaiting(0);
            errorRef.current(message);
          }
          break;
        }
      }
    } finally {
      busy.current = false;
    }
  }, [createJob]);

  const enqueue = useCallback(
    (items: ReadonlyArray<{ args: CreateJobArgs; onCreated?: (jobId: Id<"generationJobs">) => void }>) => {
      queue.current.push(...items);
      setWaiting(queue.current.length);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void pump();
    },
    [pump],
  );

  return { enqueue, waiting };
}
