import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/calendar?error=no_code", request.url));
  }

  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${API_URL}/api/calendar/token?code=${code}`, {
      method: "POST",
    });

    if (!res.ok) throw new Error("Token exchange failed");
    const data = await res.json();
    const token = data.access_token;

    // Redirect to calendar page with token in hash (client-side only)
    const redirectUrl = new URL("/calendar", request.url);
    redirectUrl.searchParams.set("google_token", token);
    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(new URL("/calendar?error=auth_failed", request.url));
  }
}
