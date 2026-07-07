import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

function isProtectedPath(pathname: string) {
  return (
    /^\/(sr|en)\/app(\/.*)?$/.test(pathname) ||
    pathname === "/api/stripe/checkout" ||
    pathname === "/api/stripe/portal" ||
    pathname === "/api/mux/upload-url" ||
    pathname === "/api/mux/playback-token"
  );
}

function shouldHandleAuthCode(request: NextRequest) {
  return !(
    /^\/(sr|en)\/sign-in$/.test(request.nextUrl.pathname) &&
    request.nextUrl.searchParams.get("mode") === "reset-confirm"
  );
}

const authProxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const isAuthenticated = await convexAuth.isAuthenticated();
  if (isAuthenticated) {
    return NextResponse.next();
  }

  const locale = request.nextUrl.pathname.startsWith("/en") ? "en" : "sr";
  const next = encodeURIComponent(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  return nextjsMiddlewareRedirect(request, `/${locale}/sign-in?next=${next}`);
}, { shouldHandleCode: shouldHandleAuthCode });

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return NextResponse.next();
  }

  return authProxy(request, event);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
