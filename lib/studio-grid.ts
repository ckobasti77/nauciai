import { useEffect, useState } from "react";

/**
 * Raspodeljuje stavke round-robin po kolonama (0 -> kolona 0, 1 -> kolona 1,
 * 2 -> kolona 2, 3 -> kolona 0...), tako da horizontalni redosled čitanja
 * (s leva nadesno po redovima) odgovara tačnom hronološkom redosledu ulaznih podataka.
 *
 * Popravka defekta 1.1 iz koraka 5 (CSS multi-column je punio kolonu po kolonu odozgo nadole).
 */
export function distributeGridColumns<T>(items: T[], columnCount: number): T[][] {
  if (columnCount <= 0) return [];
  const columns: T[][] = Array.from({ length: columnCount }, () => []);

  for (let i = 0; i < items.length; i++) {
    columns[i % columnCount].push(items[i]);
  }

  return columns;
}

/**
 * Prati broj kolona na osnovu širine prozora:
 * - < 640px (mobilni): 1 kolona
 * - 640px - 1535px (tablet / manji desktop): 2 kolone
 * - >= 1536px (široki desktop - 2xl breakpoint): 3 kolone
 */
export function useGridColumnCount(): number {
  const [columnCount, setColumnCount] = useState<number>(3);

  useEffect(() => {
    function update() {
      const width = window.innerWidth;
      if (width < 640) {
        setColumnCount(1);
      } else if (width < 1536) {
        setColumnCount(2);
      } else {
        setColumnCount(3);
      }
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columnCount;
}
