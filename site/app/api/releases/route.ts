import { NextResponse } from "next/server";

/**
 * GET /api/releases
 *
 * Returns all releases from the GitHub repository, sorted newest-first.
 * Each release includes tag, published date, release notes, and asset metadata.
 */
export async function GET() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN not configured on server" },
      { status: 500 }
    );
  }

  try {
    // Fetch all releases from GitHub (paginated, up to 30)
    const res = await fetch(
      "https://api.github.com/repos/Aditya190803/audit-app/releases?per_page=30",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Bank-Audit-App-Website",
        },
        next: { revalidate: 120 }, // Cache for 2 minutes
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }

    const releases = await res.json();

    // Return only the fields we need on the client
    const summary = releases.map(
      (r: {
        tag_name: string;
        name: string;
        published_at: string;
        body: string;
        html_url: string;
        assets: Array<{
          name: string;
          size: number;
          browser_download_url: string;
        }>;
      }) => ({
        tag_name: r.tag_name,
        name: r.name,
        published_at: r.published_at,
        body: r.body,
        html_url: r.html_url,
        assets: r.assets.map((a) => ({
          name: a.name,
          size: a.size,
          browser_download_url: a.browser_download_url,
        })),
      })
    );

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
