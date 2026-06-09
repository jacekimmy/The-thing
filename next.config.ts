import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the native ONNX runtime (transformers.js) out of the bundler so the
  // local embedding model loads correctly in the API route at runtime.
  serverExternalPackages: ["@huggingface/transformers"],
  // knowledge.json is read at runtime from the filesystem in the API route.
  // Allow remote avatar images from YouTube/Google CDNs for the UI (next session).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "**.ggpht.com" },
    ],
  },
};

export default nextConfig;
