import type { NextConfig } from "next";

const config: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "development",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Restrict embedding and dangerous resource types without breaking Next's inline hydration.
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default config;
