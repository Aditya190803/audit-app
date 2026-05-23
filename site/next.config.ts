import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Read version from root package.json
const rootPackageJsonPath = path.resolve(__dirname, "../package.json");
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf-8"));
const APP_VERSION = rootPackageJson.version;

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
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
