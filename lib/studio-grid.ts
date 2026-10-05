import { useEffect, useState, type RefObject } from "react";

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
 * Broj kolona za mrežu koja NE zauzima ceo prozor (desna kolona istorije u Crei,
 * K03): kartica ispod ~220 px ne može da nosi svoja dugmad, pa uska kolona dobija
 * jednu kolonu, a tek široka tri.
 */
export function columnsForContainerWidth(width: number): number {
  if (width < 440) return 1;
  if (width < 880) return 2;
  return 3;
}

/**
 * Broj kolona biblioteke (K16, U9) za izabranu veličinu kartice: koliko kartica
 * najmanje širine `tileWidth` staje u red sa razmakom `gap`, bar jedna, najviše 8.
 */
export function columnsForTileWidth(width: number, tileWidth: number, gap = 16): number {
  if (width <= 0 || tileWidth <= 0) return 1;
  return Math.max(1, Math.min(8, Math.floor((width + gap) / (tileWidth + gap))));
}

/**
 * Prati broj kolona na osnovu širine prozora:
 * - < 640px (mobilni): 1 kolona
 * - 640px - 1535px (tablet / manji desktop): 2 kolone
 * - >= 1536px (široki desktop - 2xl breakpoint): 3 kolone
 *
 * Uz `containerRef` meri se širina tog elementa (`columnsForContainerWidth`), ne prozora.
 */
export function useGridColumnCount(containerRef?: RefObject<HTMLElement | null>): number {
  const [columnCount, setColumnCount] = useState<number>(3);

  useEffect(() => {
    const container = containerRef?.current;
    if (container) {
      const observer = new ResizeObserver(([entry]) => {
        if (entry && entry.contentRect.width > 0) setColumnCount(columnsForContainerWidth(entry.contentRect.width));
      });
      observer.observe(container);
      return () => observer.disconnect();
    }

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
  }, [containerRef]);

  return columnCount;
}
