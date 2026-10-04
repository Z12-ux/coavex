import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname),
  // Demo mode on serverless hosts: ship the seeded SQLite file with every function.
  outputFileTracingIncludes: { "/**/*": ["./prisma/seed.db"], "/": ["./prisma/seed.db"] },
  serverExternalPackages: ["@prisma/client"],
  // Progress photos travel as data URLs (≤ ~900 KB after browser-side resizing).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
