"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import { useMemo } from "react";

import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { api } from "@/convex/_generated/api";

export type MemberIgra = NonNullable<FunctionReturnType<typeof api.igra.getMemberProgress>>;

/**
 * IGRA podaci profila člana (K13): JEDAN upit po strani (`igra:getMemberProgress` - baner,
 * nivo, bedževi iz dnevnika, radovi za godinu), ne po redu ni po kartici. Ide kroz
 * `useQueries` kao i napredak ljuske (K06): greška stiže kao vrednost, pa profil radi i
 * kad `igra:*` nije objavljen ili upit padne (`member` je tada `null`).
 */
export function useMemberIgra(username: string) {
  const todayKey = useBelgradeToday();
  const queries = useMemo(() => {
    const request: RequestForQueries = { member: { query: api.igra.getMemberProgress, args: { username, todayKey } } };
    return request;
  }, [username, todayKey]);
  const result = useQueries(queries).member as MemberIgra | null | undefined | Error;
  const setBanner = useMutation(api.igra.setBanner);
  return { member: result instanceof Error ? null : result, todayKey, setBanner };
}
