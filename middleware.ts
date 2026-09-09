import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE_NAME, GATE_COOKIE_VALUE } from "./lib/gate";

export function middleware(request: NextRequest): NextResponse {
  const unlocked = request.cookies.get(GATE_COOKIE_NAME)?.value === GATE_COOKIE_VALUE;
  if (unlocked) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/((?!api/health|api/gate|gate|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|worklets).*)",
  ],
};
