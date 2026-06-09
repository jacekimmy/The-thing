import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api/chat route reads data/*.json from disk at runtime. Next.js only
  // bundles files it can trace statically, so include the data dir explicitly,
  // otherwise the function 500s with ENOENT on the knowledge file.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/*.json"],
  },
  // Allow remote avatar images from YouTube/Google CDNs for the UI.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "**.ggpht.com" },
    ],
  },
};

export default nextConfig;
