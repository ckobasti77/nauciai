/**
 * Lebdeći dok u Studiju je `position: fixed`, ali mu se `left` i `width` prepisuju iz
 * izmerenog pravougaonika sadržaja (da bi stajao centrirano u prostoru BEZ sidebara).
 * Zbog toga je vezan za element koji sme da se prelije: čim taj element postane širi od
 * ekrana, dok se prelije zajedno sa njim, a pošto je `fixed`, prelivanje inicijalnog
 * sadržavajućeg bloka i samo po sebi pravi horizontalni skrol (UX-BOOST-PLAN §5D).
 *
 * Ovo je jedino mesto koje tu meru ograničava na viewport. Klampovanje ne "krije"
 * prelivanje — ono sprečava da mera izađe iz ekrana; uzrok širine (traka filtera) je
 * rešen posebno, u `studio-filter-bar.tsx`.
 */
export type FloatingBounds = { left: number; width: number };

export function clampBoundsToViewport(bounds: FloatingBounds, viewportWidth: number): FloatingBounds {
  // Bez upotrebljive širine ekrana nema šta da se klampuje (SSR, test bez layout-a).
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return bounds;
  if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.width)) return bounds;

  const left = Math.min(Math.max(bounds.left, 0), viewportWidth);
  const right = Math.min(bounds.left + bounds.width, viewportWidth);

  return { left, width: Math.max(0, right - left) };
}
