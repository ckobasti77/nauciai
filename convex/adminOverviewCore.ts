// Read-core za admin pregled stanja platforme. Ovde stoji SAMO čista logika
// (brojanje po statusu), da bi je vitest mogao da proveri bez baze; sva čitanja
// su u `convex/adminOverview.ts`, po uzoru na `leaderboardReadCore.ts`.

export type PublishStatus = "draft" | "published" | "archived";

export type StatusTally = {
  total: number;
  draft: number;
  published: number;
  archived: number;
};

/**
 * Koliko dokumenata po jednoj roli čitamo najviše. Convex nema `count`, pa se
 * broj studenata dobija čitanjem redova kroz indeks `by_role`. Granica postoji
 * da jedan admin pregled ne pojede transakcioni limit čitanja kad platforma
 * poraste; kad se dostigne, `capped` je `true` i UI piše "2000+" umesto broja
 * koji bi bio laž.
 */
export const STUDENT_COUNT_LIMIT = 2000;

export function emptyTally(): StatusTally {
  return { total: 0, draft: 0, published: 0, archived: 0 };
}

export function tallyStatuses(statuses: Iterable<PublishStatus>): StatusTally {
  const tally = emptyTally();
  for (const status of statuses) {
    tally.total += 1;
    tally[status] += 1;
  }
  return tally;
}

/**
 * Lekcije u šemi nemaju `status` nego `isPublished`, pa arhiva za njih ne
 * postoji i ostaje 0. Namerno vraća isti oblik kao `tallyStatuses` da bi ih UI
 * crtao istom karticom.
 */
export function tallyLessonFlags(flags: Iterable<boolean>): StatusTally {
  const tally = emptyTally();
  for (const isPublished of flags) {
    tally.total += 1;
    if (isPublished) tally.published += 1;
    else tally.draft += 1;
  }
  return tally;
}

/**
 * Zbraja korpe pročitane po roli. `capped` je istina čim je BILO KOJA korpa
 * dotakla granicu - tada je zbir donja granica, a ne tačan broj.
 */
export function tallyStudents(
  bucketSizes: readonly number[],
  limit: number = STUDENT_COUNT_LIMIT,
): { count: number; capped: boolean } {
  return {
    count: bucketSizes.reduce((sum, size) => sum + size, 0),
    capped: bucketSizes.some((size) => size >= limit),
  };
}
