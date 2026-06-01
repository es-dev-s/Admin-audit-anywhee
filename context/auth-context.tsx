"use client";
// context/auth-context.tsx
// Single source of truth for the authenticated session.
// Tokens are stored ONLY in HTTP-only cookies — managed entirely server-side.
// The client never has direct access to tokens.
//
// On mount: call /api/auth/me to check if the user has a valid session.
// Login/logout: call API endpoints; cookies are set/cleared automatically.
// No localStorage. No tokens in React state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiLogin, apiLogout, apiGetMe } from "@/lib/authClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "team_lead" | "audit_member";
};

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthUser };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // ── Bootstrap: check if user has a valid session via cookies ──
  useEffect(() => {
    apiGetMe()
      .then(({ user }) => {
        setState({
          status: "authenticated",
          user: user as AuthUser,
        });
      })
      .catch(() => {
        setState({ status: "unauthenticated" });
      });
  }, []);

  // ── Login ──────────────────────────────────────────────────────
  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await apiLogin(email, password);
      // Cookies are set automatically by the server response
      setState({ status: "authenticated", user: user as AuthUser });
    },
    []
  );

  // ── Logout ─────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* best-effort */
    }
    setState({ status: "unauthenticated" });
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Only use this inside components that are definitely inside a protected route. */
export function useRequireAuth(): AuthUser {
  const { state } = useAuth();
  if (state.status !== "authenticated") {
    throw new Error("useRequireAuth called before authentication resolved");
  }
  return state.user;
}
