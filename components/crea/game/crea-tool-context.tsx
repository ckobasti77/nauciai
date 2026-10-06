"use client";

import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { createContext, useCallback, useContext } from "react";

import { api } from "@/convex/_generated/api";

type CreateJobArgs = FunctionArgs<typeof api.studio.createJob>;

/** Alat Cree koji je trenutno otvoren (K26): posao poslat iz njega nosi `creaTool` za album. */
export const CreaToolIdContext = createContext<string | null>(null);

/**
 * `studio.createJob` kao i do sada, uz oznaku alata iz kojeg je posao poslat (album
 * sličica, G4). Oznaka ne utiče na cenu ni proveru - server je filtrira po registru.
 */
export function useCreaCreateJob() {
  const createJob = useMutation(api.studio.createJob);
  const toolId = useContext(CreaToolIdContext);
  return useCallback(
    (args: CreateJobArgs) => createJob(toolId && args.creaTool === undefined ? { ...args, creaTool: toolId } : args),
    [createJob, toolId],
  );
}
