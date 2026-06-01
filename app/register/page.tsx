"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, AlertCircle, Check, X } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { apiRegister } from "@/lib/authClient";

const EMAIL_DOMAIN = "@entegrasources.com.np";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function RegisterPage() {
  const { state } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/audit");
  }, [state.status, router]);

  const emailDomainError = useMemo(() => {
    if (!email.trim()) return null;
    if (!email.includes("@")) return null;
    if (!email.toLowerCase().trim().endsWith(EMAIL_DOMAIN))
      return `Email must end with ${EMAIL_DOMAIN}`;
    return null;
  }, [email]);

  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const passwordStrong = PASSWORD_RULES.every((r) => r.test(password));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (emailDomainError) {
      setError(emailDomainError);
      return;
    }
    if (!passwordStrong) {
      setError("Password does not meet all requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await apiRegister({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
      });
      router.replace("/audit");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  if (state.status === "loading" || state.status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-page)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
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
              <label htmlFor="register-name" className="text-sm font-medium text-[var(--text-primary)]">
                Full name
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="h-11 w-full rounded-[var(--input-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-shadow duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:shadow-[0_0_0_3px_rgba(59,125,214,0.1)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="register-email" className="text-sm font-medium text-[var(--text-primary)]">
                Email
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`you${EMAIL_DOMAIN}`}
                className={`h-11 w-full rounded-[var(--input-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-shadow duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:shadow-[0_0_0_3px_rgba(59,125,214,0.1)] ${
                  emailDomainError ? "!border-[var(--red)]" : ""
                }`}
              />
              {emailDomainError ? (
                <p className="mt-1 text-sm text-[var(--red)]">{emailDomainError}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="register-password" className="text-sm font-medium text-[var(--text-primary)]">
                Password
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
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
              {password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-2 flex flex-col gap-1"
                >
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <div key={rule.label} className="flex items-center gap-2">
                        {passed ? (
                          <Check size={12} className="shrink-0 text-[var(--green)]" />
                        ) : (
                          <X size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                        )}
                        <span
                          className={`text-xs ${passed ? "font-medium text-[var(--green)]" : "text-[var(--text-tertiary)]"}`}
                        >
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="register-confirm" className="text-sm font-medium text-[var(--text-primary)]">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="register-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`h-11 w-full rounded-[var(--input-radius)] border px-4 pr-11 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-shadow duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:shadow-[0_0_0_3px_rgba(59,125,214,0.1)] ${
                    !passwordsMatch ? "border-[var(--red)] bg-[var(--color-bg-input)]" : "border-[var(--color-border-subtle)] bg-[var(--color-bg-input)]"
                  }`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {!passwordsMatch ? (
                <p className="mt-1 text-sm text-[var(--red)]">Passwords do not match</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-[var(--input-radius)] bg-[var(--accent)] text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all duration-200 hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-md)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating account…
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
              Sign in
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
