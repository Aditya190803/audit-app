import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GET /api/update
 *
 * Returns the latest.yml manifest that electron-updater's generic provider
 * expects. The file lives at public/releases/latest.yml and is served as
 * plain YAML so the updater can parse version, sha512, and file URLs.
 */
export async function GET() {
  try {
    const manifestPath = join(process.cwd(), "public", "releases", "latest.yml");
    const yaml = readFileSync(manifestPath, "utf-8");

    return new NextResponse(yaml, {
      status: 200,
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Release manifest not found" },
      { status: 404 }
    );
  }
}
