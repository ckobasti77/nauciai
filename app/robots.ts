import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/sr/community/", "/en/community/", "/sr/courses/", "/en/courses/"],
        disallow: ["/sr/app/", "/en/app/", "/sr/sign-in", "/en/sign-in", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
