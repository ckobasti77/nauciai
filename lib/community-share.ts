export type CommunityShareTarget = "whatsapp" | "viber" | "telegram" | "x" | "email";

export type CommunityShareLink = {
  key: CommunityShareTarget;
  href: string;
};

/**
 * Cista funkcija: od adrese teme i naslova pravi deljive linkove za svaku mrezu.
 * Namerno vraca obican `<a href>` za svaki cilj - nikad `window.open` popup, koji
 * je i bio uzrok "otvori se pa se ugasi" greske na desktopu. Redosled je stalan
 * (WhatsApp, Viber, Telegram, X, Email) da bi i prikaz i test bili predvidljivi.
 */
export function buildShareLinks(url: string, title: string): CommunityShareLink[] {
  const trimmedTitle = title.trim();
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(trimmedTitle);
  const encodedTitleAndUrl = encodeURIComponent(trimmedTitle ? `${trimmedTitle} ${url}` : url);

  return [
    { key: "whatsapp", href: `https://wa.me/?text=${encodedTitleAndUrl}` },
    { key: "viber", href: `viber://forward?text=${encodedTitleAndUrl}` },
    { key: "telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}` },
    { key: "x", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
    { key: "email", href: `mailto:?subject=${encodedTitle}&body=${encodedTitleAndUrl}` },
  ];
}
