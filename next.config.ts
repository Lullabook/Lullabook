import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Persona creation uploads several photos + a selfie in a single Server
    // Action; the default 1 MB body limit 413s on real phone photos.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async redirects() {
    return [{ source: "/library", destination: "/world", permanent: false }];
  },
  async headers() {
    return [
      {
        // Share links are private-by-default (ADR-0013): never indexed.
        source: "/share/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
