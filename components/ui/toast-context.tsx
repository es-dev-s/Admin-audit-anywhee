"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

type ToastEntry = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  const iconFor = (type: ToastType) => {
    if (type === "success") return <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" />;
    if (type === "error") return <AlertCircle size={15} className="text-[var(--color-danger)] shrink-0" />;
    return <Info size={15} className="text-[var(--color-accent)] shrink-0" />;
  };

  const borderFor = (type: ToastType) => {
    if (type === "success") return "border-l-[var(--color-success)]";
    if (type === "error") return "border-l-[var(--color-danger)]";
    return "border-l-[var(--color-accent)]";
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 z-[var(--z-toast)] -translate-x-1/2 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className={`pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] border-l-2 ${borderFor(t.type)} bg-[var(--color-bg-surface)] px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-xl min-w-[280px] max-w-[400px]`}
            >
              {iconFor(t.type)}
              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
