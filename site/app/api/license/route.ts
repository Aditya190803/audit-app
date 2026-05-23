import { NextResponse } from "next/server";

/**
 * GET /api/license?appId=com.bankaudit.app
 *
 * License kill-switch endpoint.
 * Returns 200 { status: "active" } when the app is allowed to run.
 * Returns 403 { status: "revoked" } when KILL_SWITCH=1 is set in
 * Vercel environment variables, which blocks the app from operating.
 *
 * The Electron app pings this on every launch. If it gets 403, it shows
 * a full-screen error overlay. Network failures are treated as "active"
 * (fail-open) so paying clients aren't blocked by connectivity issues.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appId = searchParams.get("appId");

  // Optional: validate appId for future per-client support
  if (!appId) {
    return NextResponse.json(
      { status: "error", message: "Missing appId parameter" },
      { status: 400 }
    );
  }

  const killed = process.env.KILL_SWITCH === "1";

  if (killed) {
    return NextResponse.json(
      {
        status: "revoked",
        message:
          "License has been suspended. Please contact the developer.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  }

  return NextResponse.json(
    { status: "active" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
