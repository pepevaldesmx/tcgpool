import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // La base SQLite se genera en build (`npm run db:build`) y se lee en runtime.
  // Hay que incluirla explícitamente en el bundle de las funciones serverless.
  outputFileTracingIncludes: {
    "/**": ["./data/tcgpool.db"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
