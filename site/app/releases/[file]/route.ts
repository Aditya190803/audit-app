import { NextResponse } from "next/server";

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

    // 2. Find asset matching the requested filename
    const asset = assets.find(
      (a: any) => a.name.toLowerCase() === file.toLowerCase()
    );

    if (!asset) {
      return NextResponse.json(
        { error: `Asset "${file}" not found in latest release (${release.tag_name})` },
        { status: 404 }
      );
    }

    const isManifest = file.endsWith(".yml");

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
      // Redirect binaries to pre-signed S3 URLs to save bandwidth and prevent Vercel timeouts
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
        const s3Url = assetRes.headers.get("location");
        if (s3Url) {
          return NextResponse.redirect(s3Url, 307);
        }
      }

      // Fallback: stream if redirect wasn't handled
      return new Response(assetRes.body, {
        headers: {
          "Content-Type": assetRes.headers.get("Content-Type") || "application/octet-stream",
          "Content-Length": assetRes.headers.get("Content-Length") || "",
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
