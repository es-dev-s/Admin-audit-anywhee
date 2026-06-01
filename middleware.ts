// middleware.ts
// 1) Enterprise IP allowlist (opt-in: ENTERPRISE_IP_ALLOWLIST_ENABLED=1) — lib/enterpriseIpAllowlist.ts
// 2) JWT auth for protected routes (unchanged)
// Behind a reverse proxy: ensure x-forwarded-for or x-real-ip is set with the real client IP.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessTokenEdge } from "@/lib/edgeTokenUtils";
import {
  isEnterpriseIpAllowed,
  isEnterpriseIpAllowlistDisabled,
} from "@/lib/enterpriseIpAllowlist";

const BLOCKED_PAGE_PATH = "/blocked";

function isStaticOrPublicBypass(pathname: string): boolean {
  if (pathname.startsWith("/_next/static")) return true;
  if (pathname.startsWith("/_next/image")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/logo.ico") return true;
  if (pathname === "/404-page.png") return true;
  return false;
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return null;
}

function isIpAccessAllowed(request: NextRequest): boolean {
  if (isEnterpriseIpAllowlistDisabled()) return true;
  const ip = getClientIp(request);
  if (!ip) {
    return process.env.ENTERPRISE_ALLOW_UNKNOWN_CLIENT_IP === "1";
  }
  return isEnterpriseIpAllowed(ip);
}

function respondBlocked(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Access denied: connect from an approved company network." },
      { status: 403 },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = BLOCKED_PAGE_PATH;
  url.search = "";
  return NextResponse.redirect(url);
}

function needsAuthMiddleware(pathname: string): boolean {
  if (pathname.startsWith("/audit")) return true;
  if (pathname.startsWith("/team-lead")) return true;
  if (pathname.startsWith("/api/teams")) return true;
  if (pathname.startsWith("/api/members")) return true;
  if (pathname.startsWith("/api/invites")) return true;
  if (pathname.startsWith("/api/audit/")) return true;
  if (pathname.startsWith("/api/audit-organizations")) return true;
  if (pathname.startsWith("/api/audit-members")) return true;
  if (pathname === "/api/access-share") return true;
  if (pathname === "/api/team-lead-org-access") return true;
  if (pathname.startsWith("/api/audit-captures")) return true;
  if (pathname === "/api/audit-timeline") return true;
  return false;
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico|logo.ico|404-page\\.png).*)",
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticOrPublicBypass(pathname)) {
    return NextResponse.next();
  }

  if (!isIpAccessAllowed(request)) {
    if (pathname === BLOCKED_PAGE_PATH) {
      return NextResponse.next();
    }
    return respondBlocked(request, pathname);
  }

  if (pathname === BLOCKED_PAGE_PATH) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!needsAuthMiddleware(pathname)) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const accessToken = request.cookies.get("access_token")?.value;

  if (accessToken) {
    try {
      const payload = await verifyAccessTokenEdge(accessToken);
      return injectUserHeaders(request, payload.sub, payload.role);
    } catch {
      // fall through
    }
  }

  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (refreshToken) {
    try {
      const refreshUrl = new URL("/api/auth/refresh", request.url);
      const refreshResponse = await fetch(refreshUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `refresh_token=${refreshToken}`,
        },
      });

      if (refreshResponse.ok) {
        const setCookieHeaders = refreshResponse.headers.getSetCookie();
        let newAccessToken: string | null = null;
        for (const cookieStr of setCookieHeaders) {
          const match = cookieStr.match(/^access_token=([^;]+)/);
          if (match) {
            newAccessToken = match[1];
            break;
          }
        }

        if (newAccessToken) {
          const payload = await verifyAccessTokenEdge(newAccessToken);
          const response = injectUserHeaders(
            request,
            payload.sub,
            payload.role,
          );
          for (const cookieStr of setCookieHeaders) {
            response.headers.append("Set-Cookie", cookieStr);
          }
          return response;
        }
      }
    } catch {
      console.error("[middleware] Silent refresh failed");
    }
  }

  if (isApiRoute) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set("access_token", "", { maxAge: 0, path: "/" });
  response.cookies.set("refresh_token", "", { maxAge: 0, path: "/" });
  return response;
}

function injectUserHeaders(
  request: NextRequest,
  userId: string,
  userRole: string,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", userId);
  requestHeaders.set("x-user-role", userRole);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
