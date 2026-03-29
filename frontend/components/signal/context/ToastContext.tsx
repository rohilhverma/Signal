"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss after 3.5s
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 220);
    }, 3500);

    return () => clearTimeout(timerRef.current);
  }, [onDismiss]);

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle style={{ width: 15, height: 15, color: "#10b981", flexShrink: 0 }} />,
    error: <XCircle style={{ width: 15, height: 15, color: "#ef4444", flexShrink: 0 }} />,
    info: <AlertCircle style={{ width: 15, height: 15, color: "var(--sg-accent)", flexShrink: 0 }} />,
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 9,
        backgroundColor: "var(--sg-surface)",
        border: "1px solid var(--sg-border)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        fontSize: 13,
        color: "var(--sg-text)",
        fontFamily: "var(--font-inter, Inter, sans-serif)",
        maxWidth: 340,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        pointerEvents: "auto",
      }}
    >
      {iconMap[toast.type]}
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 220);
        }}
        aria-label="Dismiss notification"
        style={{
          background: "none",
          border: "none",
          padding: 2,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          color: "var(--sg-muted)",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        <X style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
