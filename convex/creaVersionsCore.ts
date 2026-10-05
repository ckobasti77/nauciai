/**
 * Stablo verzija Cree (K05, plan K01 §5) - čista logika, bez baze. Uvoze je i
 * Convex (`creaVersions.ts`, `studio.ts`) i UI, pa ovde nema ničeg iz `_generated`.
 */

import { v } from "convex/values";

/** Kako je rad nastao iz roditelja. Upisuje se u `generationJobs.derivation`. */
export const CREA_DERIVATIONS = [
  "izmena",
  "animacija",
  "ozvucenje",
  "lokalni-alat",
  "produzenje",
  "usavrsavanje",
  "varijacija",
  "regeneracija",
  "montaza",
  // K12: sloj iz razlaganja (Seedream 5 Pro „layerize") - dete glavnog izlaza.
  "sloj",
] as const;
export type CreaDerivation = (typeof CREA_DERIVATIONS)[number];

/**
 * Validator za argumente (`createJob`). Stoji ovde, a ne u `creaVersions.ts`: `studio.ts`
 * ga koristi na vrhu modula, a `creaVersions.ts` uvozi `studio.ts` - kružni uvoz bi ga
 * tada čitao pre nego što je napravljen.
 */
export const creaDerivationValidator = v.union(...CREA_DERIVATIONS.map((value) => v.literal(value)));

export function isCreaDerivation(value: unknown): value is CreaDerivation {
  return typeof value === "string" && (CREA_DERIVATIONS as readonly string[]).includes(value);
}

/** Koliko radova jednog stabla upit čita (plus koren, trenutni rad i njegov roditelj). */
export const VERSION_TREE_MAX_NODES = 100;
/** Dublje od ovoga se uvlačenje ne povećava (traka ostaje čitljiva). */
export const VERSION_TREE_MAX_DEPTH = 20;

type MediaKind = "image" | "video" | "audio";

/**
 * Veze novog rada ka roditelju. Invarijanta: `rootJobId = parent.rootJobId ?? parent._id`,
 * pa svi radovi jednog stabla dele isti koren i čitaju se jednim indeksom.
 */
export function lineageFrom<Id extends string>(parent: { _id: Id; rootJobId?: Id }): { parentJobId: Id; rootJobId: Id } {
  return { parentJobId: parent._id, rootJobId: parent.rootJobId ?? parent._id };
}

/**
 * Podrazumevan naziv izvođenja kad ga pozivalac ne navede: slika → video je
 * animacija, bilo šta → zvuk je ozvučenje, ostalo (ista vrsta) je izmena.
 */
export function derivationFor(parentKind: MediaKind, childKind: MediaKind): CreaDerivation {
  if (childKind === "audio" && parentKind !== "audio") return "ozvucenje";
  if (childKind === "video" && parentKind === "image") return "animacija";
  return "izmena";
}

export type VersionNodeInput = { _id: string; parentJobId?: string | null; createdAt: number };

export type VersionTree<T extends VersionNodeInput> = {
  root: T;
  /** Deca po roditelju (po stablu, ne nužno po upisanom `parentJobId`), od najstarijeg. */
  children: Map<string, T[]>;
  /** Roditelj u stablu; koren ima `null`. */
  parentOf: Map<string, string | null>;
  depth: Map<string, number>;
  /** Put od korena do rada (uključujući oba); prazan za nepoznat id. */
  pathTo(id: string): T[];
};

const byAge = (a: VersionNodeInput, b: VersionNodeInput) => a.createdAt - b.createdAt || (a._id < b._id ? -1 : 1);

/**
 * Stablo iz ravnog spiska radova:
 * - rad čiji roditelj nije u spisku (obrisan, ili van granice čitanja) kači se na koren;
 * - ako korena nema (obrisan), najstariji rad postaje koren;
 * - ciklus (ne bi smeo da postoji, ali podaci su podaci) se prekida kačenjem na koren;
 * - dubina se računa do `VERSION_TREE_MAX_DEPTH`, dublje se ne uvlači.
 */
export function buildVersionTree<T extends VersionNodeInput>(nodes: readonly T[], rootId: string): VersionTree<T> | null {
  const byId = new Map<string, T>();
  for (const node of nodes) if (!byId.has(node._id)) byId.set(node._id, node);
  if (byId.size === 0) return null;

  const sorted = [...byId.values()].sort(byAge);
  const root = byId.get(rootId) ?? sorted[0];

  const parentOf = new Map<string, string | null>();
  const children = new Map<string, T[]>();
  for (const node of sorted) children.set(node._id, []);
  for (const node of sorted) {
    if (node._id === root._id) {
      parentOf.set(node._id, null);
      continue;
    }
    const wanted = node.parentJobId ?? null;
    const parent = wanted !== null && wanted !== node._id && byId.has(wanted) ? wanted : root._id;
    parentOf.set(node._id, parent);
    children.get(parent)!.push(node);
  }

  // Obilazak od korena; ono što se ne dosegne je deo ciklusa i kači se na koren.
  const depth = new Map<string, number>();
  const walk = (startId: string, startDepth: number) => {
    const stack: Array<[string, number]> = [[startId, startDepth]];
    while (stack.length > 0) {
      const [id, d] = stack.pop()!;
      if (depth.has(id)) continue;
      depth.set(id, Math.min(d, VERSION_TREE_MAX_DEPTH));
      for (const child of children.get(id)!) stack.push([child._id, d + 1]);
    }
  };
  walk(root._id, 0);
  for (const node of sorted) {
    if (depth.has(node._id)) continue;
    const oldParent = parentOf.get(node._id)!;
    const siblings = children.get(oldParent)!;
    siblings.splice(siblings.indexOf(node), 1);
    parentOf.set(node._id, root._id);
    children.get(root._id)!.push(node);
    walk(node._id, 1);
  }
  for (const list of children.values()) list.sort(byAge);

  return {
    root,
    children,
    parentOf,
    depth,
    pathTo(id) {
      if (!byId.has(id)) return [];
      const path: T[] = [];
      let current: string | null = id;
      while (current !== null) {
        path.push(byId.get(current)!);
        current = parentOf.get(current) ?? null;
      }
      return path.reverse();
    },
  };
}

/** Stablo kao spisak za crtanje: koren pa deca, dubinski, od najstarijeg; uz dubinu i roditelja u stablu. */
export function flattenVersionTree<T extends VersionNodeInput>(
  tree: VersionTree<T>,
): Array<T & { depth: number; treeParentId: string | null }> {
  const out: Array<T & { depth: number; treeParentId: string | null }> = [];
  const stack: T[] = [tree.root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push({ ...node, depth: tree.depth.get(node._id) ?? 0, treeParentId: tree.parentOf.get(node._id) ?? null });
    const kids = tree.children.get(node._id) ?? [];
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  }
  return out;
}
