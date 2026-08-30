/**
 * Kuda se korisnik vraća sa Stripe Checkout-a za kredite (studio-public F4).
 * Klijent NIKAD ne šalje URL - šalje samo kontekst ("studio" iz samostalnog
 * shell-a), a server ga kroz OVU allowlistu mapira u putanju. Nepoznat,
 * odsutan ili izmišljen kontekst pada na školski /app/credits - allowlista
 * JESTE validacija.
 */
export const CREDITS_RETURN_PATHS = {
  app: "/app/credits",
  studio: "/studio/krediti",
} as const;

export type CreditsReturnContext = keyof typeof CREDITS_RETURN_PATHS;

export function creditsReturnPath(
  context: unknown,
): (typeof CREDITS_RETURN_PATHS)[CreditsReturnContext] {
  return context === "studio" ? CREDITS_RETURN_PATHS.studio : CREDITS_RETURN_PATHS.app;
}
