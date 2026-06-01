"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Shield, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { apiValidateInvite, apiRedeemInvite } from "@/lib/authClient";
import { useAuth } from "@/context/auth-context";

type InviteState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "valid"; expiresAt: string }
  | { status: "redeemed" };

export default function InviteRedeemPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { state } = useAuth();

  const [invite, setInvite] = useState<InviteState>({ status: "loading" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Already logged in? redirect
  useEffect(() => {
    if (state.status === "authenticated") router.replace("/audit");
  }, [state.status, router]);

  // Validate the invite token on mount
  useEffect(() => {
    if (!token) return;
    apiValidateInvite(token)
      .then((data) => setInvite({ status: "valid", expiresAt: data.expiresAt }))
      .catch((err: Error) => setInvite({ status: "invalid", message: err.message }));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !email.trim() || !password) {
      setFormError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRedeemInvite(token, {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setInvite({ status: "redeemed" });
      // Redirect to login so they sign in with their new credentials
      setTimeout(() => router.replace("/login"), 2500);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Redemption failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-bg-base)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px]"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-accent)] shadow-[var(--shadow-md)]">
            <Shield size={22} className="text-[var(--color-text-inverse)]" strokeWidth={2} />
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-text-primary)]">
            You&apos;ve been invited
          </h1>
          <p className="mt-1 text-center text-[14px] text-[var(--color-text-muted)]">
            Create your Audit Desk account to get started
          </p>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-md)] ring-1 ring-[var(--color-border-subtle)]">
          {/* Loading state */}
          {invite.status === "loading" && (
            <div className="flex flex-col items-center py-16 gap-4">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
              <p className="text-[13px] text-gray-500">Validating invite…</p>
            </div>
          )}

          {/* Invalid */}
          {invite.status === "invalid" && (
            <div className="flex flex-col items-center py-16 px-8 gap-4 text-center">
              <AlertCircle size={36} className="text-red-400" />
              <p className="text-[16px] font-bold text-gray-900">Invite Unavailable</p>
              <p className="text-[13px] text-gray-500">{invite.message}</p>
            </div>
          )}

          {/* Success */}
          {invite.status === "redeemed" && (
            <div className="flex flex-col items-center py-16 px-8 gap-4 text-center">
              <CheckCircle size={36} className="text-[rgb(52,199,89)]" />
              <p className="text-[16px] font-bold text-gray-900">Account Created!</p>
              <p className="text-[13px] text-gray-500">
                Redirecting you to login…
              </p>
            </div>
          )}

          {/* Form */}
          {invite.status === "valid" && (
            <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-4">
              {/* Expiry notice */}
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
                <Clock size={13} className="text-gray-400 shrink-0" />
                <p className="text-[12px] text-gray-500">
                  Invite expires {new Date(invite.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {formError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3"
                >
                  <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[13px] font-medium text-red-700">{formError}</p>
                </motion.div>
              )}

              {[
                { id: "name", label: "Full Name", type: "text", value: name, onChange: (v: string) => setName(v), placeholder: "Jane Smith" },
                { id: "email", label: "Email address", type: "email", value: email, onChange: (v: string) => setEmail(v), placeholder: "jane@company.com" },
              ].map(({ id, label, type, value, onChange, placeholder }) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <label htmlFor={id} className="text-[13px] font-semibold text-gray-700">{label}</label>
                  <input
                    id={id} type={type} value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-900/5"
                  />
                </div>
              ))}

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-[13px] font-semibold text-gray-700">Password</label>
                <div className="relative">
                  <input
                    id="password" type={showPwd ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 pr-11 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-900/5"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-0 top-0 h-11 w-11 grid place-items-center text-gray-400 hover:text-gray-700">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm" className="text-[13px] font-semibold text-gray-700">Confirm Password</label>
                <input
                  id="confirm" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-900/5"
                />
              </div>

              <button
                type="submit" disabled={submitting}
                className="mt-1 h-11 w-full rounded-lg bg-gray-900 text-white text-[14px] font-semibold tracking-wide transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Creating account…
                  </>
                ) : "Create Account"}
              </button>
            </form>
          )}

          <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-8 py-4">
            <p className="text-center text-[12px] text-[var(--color-text-muted)]">
              Already have an account?{" "}
              <a href="/login" className="ui-link">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
