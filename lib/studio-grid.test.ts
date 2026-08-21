import { describe, expect, it } from "vitest";

import { distributeGridColumns } from "./studio-grid";

describe("distributeGridColumns", () => {
  it("returns empty array when columnCount is 0 or negative", () => {
    expect(distributeGridColumns([1, 2, 3], 0)).toEqual([]);
    expect(distributeGridColumns([1, 2, 3], -1)).toEqual([]);
  });

  it("returns empty columns for empty input", () => {
    expect(distributeGridColumns([], 1)).toEqual([[]]);
    expect(distributeGridColumns([], 3)).toEqual([[], [], []]);
  });

  it("distributes single column", () => {
    const items = ["a", "b", "c", "d"];
    expect(distributeGridColumns(items, 1)).toEqual([["a", "b", "c", "d"]]);
  });

  it("distributes items round-robin across two columns", () => {
    const items = [0, 1, 2, 3, 4];
    const columns = distributeGridColumns(items, 2);
    expect(columns).toEqual([
      [0, 2, 4],
      [1, 3],
    ]);
  });

  it("distributes items round-robin across three columns", () => {
    const items = [0, 1, 2, 3, 4, 5, 6];
    const columns = distributeGridColumns(items, 3);
    expect(columns).toEqual([
      [0, 3, 6],
      [1, 4],
      [2, 5],
    ]);
  });

  it("preserves horizontal left-to-right reading order equivalent to original sequence", () => {
    const items = ["item-0", "item-1", "item-2", "item-3", "item-4", "item-5", "item-6", "item-7"];
    const columnCount = 3;
    const columns = distributeGridColumns(items, columnCount);

    // Reconstruct items in reading order: row 0 (col0, col1, col2), row 1 (col0, col1, col2)...
    const reconstructed: string[] = [];
    const maxRows = Math.max(...columns.map((col) => col.length));
    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < columnCount; c++) {
        if (columns[c][r] !== undefined) {
          reconstructed.push(columns[c][r]);
        }
      }
    }

    expect(reconstructed).toEqual(items);
  });
});
