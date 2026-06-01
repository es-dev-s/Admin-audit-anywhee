"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";

const EMAIL_DOMAIN = "@entegrasources.com.np";

function LoginPageInner() {
  const { state, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") {
      const from = searchParams.get("from");
      router.replace(from && from.startsWith("/") ? from : "/audit");
    }
  }, [state.status, router, searchParams]);

  const emailDomainError = useMemo(() => {
    if (!email.trim()) return null;
    if (!email.includes("@")) return null;
    if (!email.toLowerCase().trim().endsWith(EMAIL_DOMAIN)) {
      return `Email must end with ${EMAIL_DOMAIN}`;
    }
    return null;
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    if (emailDomainError) {
      setError(emailDomainError);
      return;
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (state.status === "loading" || state.status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-page)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-bg-page)] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(circle at center, black 35%, transparent 90%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/96 p-10 shadow-[var(--shadow-sm)] backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-lg border border-[var(--red)]/20 bg-[var(--red)]/10 px-3 py-2.5"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--red)]" />
                <p className="text-sm text-[var(--red)]">{error}</p>
              </motion.div>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="login-email" className="text-sm font-medium text-[var(--text-primary)]">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`you${EMAIL_DOMAIN}`}
                className={`h-11 w-full rounded-[var(--input-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-shadow duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:shadow-[0_0_0_3px_rgba(59,125,214,0.1)] ${
                  emailDomainError ? "border-[var(--red)]" : ""
                }`}
              />
              {emailDomainError ? (
                <p className="mt-1 text-sm text-[var(--red)]">{emailDomainError}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="login-password" className="text-sm font-medium text-[var(--text-primary)]">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-[var(--input-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-4 pr-11 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-shadow duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:shadow-[0_0_0_3px_rgba(59,125,214,0.1)]"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-[var(--input-radius)] bg-[var(--accent)] text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all duration-200 hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-md)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Don&apos;t have an account?{" "}
            <a href="/register" className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
              Create one
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-page)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
