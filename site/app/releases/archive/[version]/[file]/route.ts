import { NextResponse } from "next/server";

function normalizeAssetName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string; file: string }> }
) {
  const resolvedParams = await params;
  const { version, file } = resolvedParams;

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN not configured on server" },
      { status: 404 }
    );
  }

  try {
    // Fetch a specific release by tag from GitHub
    const encodedTag = encodeURIComponent(version);
    const releaseRes = await fetch(
      `https://api.github.com/repos/Aditya190803/audit-app/releases/tags/${encodedTag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        next: { revalidate: 120 }, // Cache release info for 2 minutes
      }
    );

    if (!releaseRes.ok) {
      return NextResponse.json(
        {
          error: `Release "${version}" not found: ${releaseRes.status} ${releaseRes.statusText}`,
        },
        { status: releaseRes.status === 404 ? 404 : 500 }
      );
    }

    const release = await releaseRes.json();
    const assets = release.assets || [];
    const requestedFile = decodeURIComponent(file);

    // Find asset matching the requested filename
    const normalizedRequest = normalizeAssetName(requestedFile);
    const asset = assets.find(
      (a: { name: string; id: number; browser_download_url?: string }) =>
        a.name.toLowerCase() === requestedFile.toLowerCase() ||
        normalizeAssetName(a.name) === normalizedRequest
    );

    if (!asset) {
      return NextResponse.json(
        {
          error: `Asset "${requestedFile}" not found in release ${version}. Available assets: ${assets.map((a: { name: string }) => a.name).join(", ") || "none"}`,
        },
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
      // Redirect to GitHub's signed download URL for binary files
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
        {
          error: `Failed to create signed download URL: ${assetRes.status} ${assetRes.statusText}`,
        },
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
