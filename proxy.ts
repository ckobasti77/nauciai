import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { internalPath, parsePath, toPublicPath } from "./lib/routes";

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Rute bez jezika: /api, /trpc, /_next, /_vercel, i fajlovi sa ekstenzijom
// (/sitemap.xml, /robots.txt, /favicon.ico). Ne kanonizuju se i ne rewrite-uju.
const NO_LOCALE = /^\/(api|trpc|_next|_vercel)(\/|$)|^\/[^/]+\.[^/]+$/;

// Regexi rade nad KANONSKOM putanjom (bez locale prefiksa, prvi segment sveden).
function isProtectedPath(canonicalPath: string) {
  return /^\/app(\/.*)?$/.test(canonicalPath);
}

function isSignInPath(canonicalPath: string) {
  return /^\/sign-in$/.test(canonicalPath);
}

function isResetConfirmRequest(request: NextRequest, canonicalPath: string) {
  return (
    (canonicalPath === "/reset-password" || isSignInPath(canonicalPath)) &&
    (canonicalPath.endsWith("/reset-password") || request.nextUrl.searchParams.get("mode") === "reset-confirm")
  );
}

function shouldHandleAuthCode(request: NextRequest) {
  const { canonicalPath } = parsePath(request.nextUrl.pathname);
  return !isResetConfirmRequest(request, canonicalPath);
}

const authProxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const { locale, canonicalPath } = parsePath(request.nextUrl.pathname);
  const isAuthenticated = await convexAuth.isAuthenticated();

  if (isSignInPath(canonicalPath) && !isResetConfirmRequest(request, canonicalPath) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, toPublicPath(locale, "/app"));
  }

  if (!isProtectedPath(canonicalPath)) {
    return NextResponse.next();
  }

  if (isAuthenticated) {
    return NextResponse.next();
  }

  const next = encodeURIComponent(`${toPublicPath(locale, canonicalPath)}${request.nextUrl.search}`);
  return nextjsMiddlewareRedirect(request, `${toPublicPath(locale, "/sign-in")}?next=${next}`);
}, {
  cookieConfig: { maxAge: AUTH_COOKIE_MAX_AGE_SECONDS },
  shouldHandleCode: shouldHandleAuthCode,
});

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (NO_LOCALE.test(pathname)) return NextResponse.next();

  const { locale, canonicalPath } = parsePath(pathname);

  // 1. Kanonizacija: svaki stari/pogrešan javni URL -> 308 na kanonski. Jedno pravilo
  //    pokriva /sr/*, /en/pogrešan-slug i stare EN legal URL-ove. PRESKAČE se dok stiže
  //    OAuth `code` (Convex prvo potroši code, pa posle njegovog redirecta kanonizujemo).
  const publicPath = toPublicPath(locale, canonicalPath);
  if (publicPath !== pathname && !request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = publicPath;
    return NextResponse.redirect(url, 308);
  }

  // Rewrite javne putanje u internu (/sr + canonicalPath) da bi Next razrešio rutu.
  // `en` je već prava interna putanja. Kolačići (osveženi tokeni) se ručno prenose:
  // vraćanje rewrite-a IZ Convex handlera bi ga tiho pojeo na osvežavanju tokena
  // (NextResponse.next(response) re-wrap u @convex-dev/auth).
  const rewriteToInternal = (base: NextResponse | null): NextResponse => {
    if (locale === "en") return base ?? NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = internalPath(locale, canonicalPath);
    const rewritten = NextResponse.rewrite(url, { request: { headers: request.headers } });
    if (base) for (const cookie of base.cookies.getAll()) rewritten.cookies.set(cookie);
    return rewritten;
  };

  // 2. Bez backend-a: preskoči auth, ali i dalje rewrite (sr strane moraju da se renderuju).
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return rewriteToInternal(null);

  // 3. Auth (nad canonicalPath), pa rewrite uz prenos kolačića.
  const res = await authProxy(request, event);
  if (res instanceof NextResponse) {
    if (res.headers.get("Location")) return res; // auth redirect — ne diramo
    return rewriteToInternal(res);
  }
  return rewriteToInternal(null);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
