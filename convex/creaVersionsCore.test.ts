import { describe, expect, test } from "vitest";

import {
  buildVersionTree,
  CREA_DERIVATIONS,
  derivationFor,
  flattenVersionTree,
  isCreaDerivation,
  lineageFrom,
  VERSION_TREE_MAX_DEPTH,
} from "./creaVersionsCore";

type Node = { _id: string; parentJobId?: string | null; createdAt: number };
const node = (_id: string, createdAt: number, parentJobId?: string): Node => ({
  _id,
  createdAt,
  ...(parentJobId ? { parentJobId } : {}),
});
const ids = (list: Array<{ _id: string }>) => list.map((entry) => entry._id);

describe("veze ka roditelju", () => {
  test("koren je roditelj sam sebi koren; dete deteta nasleđuje koren", () => {
    expect(lineageFrom({ _id: "r" })).toEqual({ parentJobId: "r", rootJobId: "r" });
    expect(lineageFrom({ _id: "a", rootJobId: "r" })).toEqual({ parentJobId: "a", rootJobId: "r" });
  });

  test("podrazumevano izvođenje po vrsti roditelja i deteta", () => {
    expect(derivationFor("image", "image")).toBe("izmena");
    expect(derivationFor("image", "video")).toBe("animacija");
    expect(derivationFor("video", "video")).toBe("izmena");
    expect(derivationFor("image", "audio")).toBe("ozvucenje");
    expect(derivationFor("video", "audio")).toBe("ozvucenje");
    expect(derivationFor("audio", "audio")).toBe("izmena");
  });

  test("spisak izvođenja je plan K01 §5.1, i samo on prolazi proveru", () => {
    expect([...CREA_DERIVATIONS]).toEqual([
      "izmena",
      "animacija",
      "ozvucenje",
      "lokalni-alat",
      "produzenje",
      "usavrsavanje",
      "varijacija",
      "regeneracija",
      "montaza",
    ]);
    for (const value of CREA_DERIVATIONS) expect(isCreaDerivation(value)).toBe(true);
    expect(isCreaDerivation("remiks")).toBe(false);
    expect(isCreaDerivation(undefined)).toBe(false);
  });
});

describe("buildVersionTree", () => {
  test("oblik stabla: deca od najstarijeg, dubina, put i ravan spisak", () => {
    const tree = buildVersionTree(
      [node("b", 3, "r"), node("c", 4, "a"), node("r", 1), node("a", 2, "r"), node("d", 5, "c")],
      "r",
    )!;
    expect(tree.root._id).toBe("r");
    expect(ids(tree.children.get("r")!)).toEqual(["a", "b"]);
    expect(ids(tree.children.get("a")!)).toEqual(["c"]);
    expect(tree.depth.get("d")).toBe(3);
    expect(tree.parentOf.get("r")).toBeNull();
    expect(ids(tree.pathTo("d"))).toEqual(["r", "a", "c", "d"]);
    expect(tree.pathTo("nema")).toEqual([]);

    const flat = flattenVersionTree(tree);
    expect(flat.map((row) => [row._id, row.depth, row.treeParentId])).toEqual([
      ["r", 0, null],
      ["a", 1, "r"],
      ["c", 2, "a"],
      ["d", 3, "c"],
      ["b", 1, "r"],
    ]);
  });

  test("rad čiji je roditelj obrisan kači se na koren", () => {
    const tree = buildVersionTree([node("r", 1), node("x", 3, "obrisan")], "r")!;
    expect(tree.parentOf.get("x")).toBe("r");
    expect(tree.depth.get("x")).toBe(1);
  });

  test("obrisan koren: najstariji rad postaje koren, ostali se kače na njega", () => {
    const tree = buildVersionTree([node("b", 5, "a"), node("a", 2, "r"), node("z", 9, "r")], "r")!;
    expect(tree.root._id).toBe("a");
    expect(ids(tree.children.get("a")!)).toEqual(["b", "z"]);
    expect(ids(tree.pathTo("b"))).toEqual(["a", "b"]);
  });

  test("ciklus i rad koji je sam sebi roditelj ne obaraju gradnju i ne gube čvorove", () => {
    const tree = buildVersionTree(
      [node("r", 1), node("a", 2, "b"), node("b", 3, "a"), node("c", 4, "b"), node("s", 5, "s")],
      "r",
    )!;
    const flat = flattenVersionTree(tree);
    expect(ids(flat).sort()).toEqual(["a", "b", "c", "r", "s"]);
    expect(tree.parentOf.get("a")).toBe("r");
    expect(tree.parentOf.get("b")).toBe("a");
    expect(tree.parentOf.get("s")).toBe("r");
    expect(ids(tree.pathTo("c"))).toEqual(["r", "a", "b", "c"]);
  });

  test(`dubina se ne uvlači dalje od ${VERSION_TREE_MAX_DEPTH}`, () => {
    const chain = [node("n0", 0)];
    for (let i = 1; i <= 30; i += 1) chain.push(node(`n${i}`, i, `n${i - 1}`));
    const tree = buildVersionTree(chain, "n0")!;
    expect(tree.depth.get("n30")).toBe(VERSION_TREE_MAX_DEPTH);
    expect(tree.pathTo("n30")).toHaveLength(31);
  });

  test("prazan spisak nema stablo; duplikat se broji jednom", () => {
    expect(buildVersionTree([], "r")).toBeNull();
    const tree = buildVersionTree([node("r", 1), node("a", 2, "r"), node("a", 2, "r")], "r")!;
    expect(flattenVersionTree(tree)).toHaveLength(2);
  });
});
