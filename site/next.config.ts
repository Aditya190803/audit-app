import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Read version from root package.json
const rootPackageJsonPath = path.resolve(__dirname, "../package.json");
let appVersion = "1.0.0";
try {
  const packageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf-8"));
  appVersion = packageJson.version;
} catch (e) {
  console.warn("Could not read root package.json version, defaulting to 1.0.0", e);
}

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  async redirects() {
    return [
      {
        source: "/releases/:path*",
        destination: `https://github.com/Aditya190803/audit-app/releases/download/v${appVersion}/:path*`,
        permanent: false,
      },
      {
        source: "/api/update",
        destination: `https://github.com/Aditya190803/audit-app/releases/download/v${appVersion}/latest.yml`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
