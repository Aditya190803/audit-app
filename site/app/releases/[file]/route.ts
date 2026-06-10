import { NextResponse } from "next/server";

function normalizeAssetName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const resolvedParams = await params;
  const file = resolvedParams.file;

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    // No token available (local dev) — return a minimal fallback for manifests
    if (file.endsWith(".yml")) {
      const fallbackVersion = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
      return new Response(`version: ${fallbackVersion}\n`, {
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    }
    return NextResponse.json(
      { error: "GITHUB_TOKEN not configured on server" },
      { status: 404 }
    );
  }

  try {
    // 1. Fetch latest release details from GitHub
    const releaseRes = await fetch(
      "https://api.github.com/repos/Aditya190803/audit-app/releases/latest",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        next: { revalidate: 60 }, // Cache release info for 60 seconds
      }
    );

    if (!releaseRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch release info: ${releaseRes.statusText}` },
        { status: 500 }
      );
    }

    const release = await releaseRes.json();
    const assets = release.assets || [];
    const requestedFile = decodeURIComponent(file);

    // 2. Find asset matching the requested filename. Electron Builder outputs
    // dot-separated names, but browsers/users may request space-separated names.
    const normalizedRequest = normalizeAssetName(requestedFile);
    const asset = assets.find(
      (a: { name: string; id: number; browser_download_url?: string }) => (
        a.name.toLowerCase() === requestedFile.toLowerCase() ||
        normalizeAssetName(a.name) === normalizedRequest
      )
    );

    if (!asset) {
      return NextResponse.json(
        { error: `Asset "${requestedFile}" not found in latest release (${release.tag_name})` },
        { status: 404 }
      );
    }

    const isManifest = requestedFile.endsWith(".yml");

    if (isManifest) {
      // Fetch and serve YAML manifests directly
      const assetRes = await fetch(
        `https://api.github.com/repos/Aditya190803/audit-app/releases/assets/${asset.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/octet-stream",
          },
        }
      );

      if (!assetRes.ok) {
        return NextResponse.json(
          { error: `Failed to fetch manifest content: ${assetRes.statusText}` },
          { status: 500 }
        );
      }

      const content = await assetRes.text();
      return new Response(content, {
        headers: {
          "Content-Type": "text/yaml; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } else {
      // Never proxy large binaries through Vercel/Next.js. Streaming .exe files here can
      // truncate or alter the response, which causes NSIS integrity errors on Windows.
      // For a private repo, use the server-side token only to obtain GitHub's temporary
      // signed binary URL, then redirect the browser there. The token is never exposed.
      const assetRes = await fetch(
        `https://api.github.com/repos/Aditya190803/audit-app/releases/assets/${asset.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/octet-stream",
          },
          redirect: "manual",
        }
      );

      if (assetRes.status === 302 || assetRes.status === 307) {
        const signedUrl = assetRes.headers.get("location");
        if (signedUrl) {
          return NextResponse.redirect(signedUrl, 307);
        }
      }

      return NextResponse.json(
        { error: `Failed to create signed download URL: ${assetRes.status} ${assetRes.statusText}` },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
