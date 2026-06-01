// middleware.ts
// JWT auth for protected routes.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessTokenEdge } from "@/lib/edgeTokenUtils";

function isStaticOrPublicBypass(pathname: string): boolean {
  if (pathname.startsWith("/_next/static")) return true;
  if (pathname.startsWith("/_next/image")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/logo.ico") return true;
  if (pathname === "/404-page.png") return true;
  return false;
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
      const cookieHeader =
        request.headers.get("cookie") ??
        `refresh_token=${refreshToken}`;
      const refreshResponse = await fetch(refreshUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        cache: "no-store",
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
