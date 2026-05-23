import fs from "node:fs";
import path from "node:path";
import LandingPage from "./LandingPage";

// Force Next.js to dynamically render this page on every request or use 60s ISR revalidation
export const revalidate = 60; // Revalidate every 60 seconds

async function getLatestVersion(): Promise<string> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  
  // Default fallback from root package.json
  let fallbackVersion = "1.0.0";
  try {
    const rootPackageJsonPath = path.resolve(process.cwd(), "../package.json");
    if (fs.existsSync(rootPackageJsonPath)) {
      const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf-8"));
      fallbackVersion = rootPackageJson.version;
    }
  } catch (err) {
    console.error("Failed to read root package.json for fallback version:", err);
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Bank-Audit-App-Website",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(
      "https://api.github.com/repos/Aditya190803/audit-app/releases/latest",
      {
        headers,
        next: { revalidate: 60 }, // Cache release info for 60 seconds
      }
    );

    if (res.ok) {
      const release = await res.json();
      if (release && release.tag_name) {
        // Strip 'v' prefix if present, e.g. "v1.0.1" -> "1.0.1"
        return release.tag_name.replace(/^v/, "");
      }
    } else {
      console.warn(`GitHub API returned status ${res.status} when fetching latest release.`);
    }
  } catch (err) {
    console.error("Failed to fetch latest version from GitHub releases:", err);
  }

  return fallbackVersion;
}

export default async function Home() {
  const version = await getLatestVersion();
  return <LandingPage initialVersion={version} />;
}
