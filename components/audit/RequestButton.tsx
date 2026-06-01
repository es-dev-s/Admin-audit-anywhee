"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { type AuditStatus } from "@/lib/mockData";

type RequestButtonProps = {
  status: AuditStatus;
  teamId: string;
  onRequest: () => void;
  onCancel: () => void;
};

const baseClass =
  "min-w-[130px] flex justify-center items-center rounded-[var(--radius-md)] border px-4 py-2 text-[12px] font-semibold transition-all duration-200";

export function RequestButton({ status, teamId, onRequest, onCancel }: RequestButtonProps) {
  const content = () => {
    if (status === "accepted") {
      return (
        <Link className={`${baseClass} border-transparent bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]`} href={`/audit/${teamId}`}>
          View Team
        </Link>
      );
    }
    if (status === "pending") {
      return (
        <button className={`${baseClass} border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]`} onClick={onCancel} type="button">
          Cancel Request
        </button>
      );
    }
    if (status === "declined") {
      return (
        <button className={`${baseClass} border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]`} onClick={onRequest} type="button">
          Re-Request
        </button>
      );
    }
    return (
      <button className={`${baseClass} border-transparent bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]`} onClick={onRequest} type="button">
        Request Audit
      </button>
    );
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div key={status} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} initial={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}>
        {content()}
      </motion.div>
    </AnimatePresence>
  );
}
