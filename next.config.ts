import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
