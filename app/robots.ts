import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/sr/community",
          "/en/community",
          "/sr/courses/",
          "/en/courses/",
          "/sr/studio",
          "/en/studio",
        ],
        // Duži prefiks pobeđuje: landing /studio je dozvoljen, a radni prostor
        // i kupovina (studio-public F3) ostaju van indeksa kao i /app/.
        disallow: [
          "/sr/app/",
          "/en/app/",
          "/sr/studio/app",
          "/en/studio/app",
          "/sr/studio/krediti",
          "/en/studio/krediti",
          "/sr/sign-in",
          "/en/sign-in",
          "/api/",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
