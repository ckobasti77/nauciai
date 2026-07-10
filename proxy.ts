import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function localeFromPathname(pathname: string) {
  return pathname.startsWith("/en") ? "en" : "sr";
}

function isProtectedPath(pathname: string) {
  return (
    /^\/(sr|en)\/app(\/.*)?$/.test(pathname) ||
    pathname === "/api/stripe/checkout" ||
    pathname === "/api/stripe/portal"
  );
}

function isSignInPath(pathname: string) {
  return /^\/(sr|en)\/sign-in$/.test(pathname);
}

function isResetConfirmRequest(request: NextRequest) {
  return (
    isSignInPath(request.nextUrl.pathname) &&
    request.nextUrl.searchParams.get("mode") === "reset-confirm"
  );
}

function shouldHandleAuthCode(request: NextRequest) {
  return !isResetConfirmRequest(request);
}

const authProxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();

  if (isSignInPath(request.nextUrl.pathname) && !isResetConfirmRequest(request) && isAuthenticated) {
    const locale = localeFromPathname(request.nextUrl.pathname);
    return nextjsMiddlewareRedirect(request, `/${locale}/app`);
  }

  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (isAuthenticated) {
    return NextResponse.next();
  }

  const locale = localeFromPathname(request.nextUrl.pathname);
  const next = encodeURIComponent(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  return nextjsMiddlewareRedirect(request, `/${locale}/sign-in?next=${next}`);
}, {
  cookieConfig: { maxAge: AUTH_COOKIE_MAX_AGE_SECONDS },
  shouldHandleCode: shouldHandleAuthCode,
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return NextResponse.next();
  }

  return authProxy(request, event);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
