import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/api/update",
        destination: "/releases/latest.yml",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
