import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard: redirects anonymous visitors to /login. It only checks cookie
 * presence; real authorization happens server-side in layouts and actions.
 */
const PUBLIC = ["/login", "/api/health", "/brand"]; // /brand = public brand images shown on the sign-in screen

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const hasSession = req.cookies.has("coachos_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|webp|svg|ico)).*)"],
};
