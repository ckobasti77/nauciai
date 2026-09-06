import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AVIF prvi (najbolja kompresija), pa WebP kao fallback. Next/image bira
    // format po `Accept` zaglavlju pregledača.
    formats: ["image/avif", "image/webp"],
  },
  // Kad Next sam služi statični .webm iz public/ (Vercel/lokal), prisili ispravan
  // MIME tip. Na LiteSpeed produkciji isto radi public/.htaccess.
  async headers() {
    return [
      {
        source: "/images/:path*.webm",
        headers: [{ key: "Content-Type", value: "video/webm" }],
      },
    ];
  },
};

export default nextConfig;
