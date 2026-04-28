"use client";

import { useEffect, useMemo, useState } from "react";
import { Coffee, Loader2, LogIn, Moon, Rss, Sun, UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { usePreferences, type Theme } from "../context/PreferencesContext";
import { useToast } from "../context/ToastContext";

type AuthMode = "signin" | "signup";

const THEME_ICONS: Record<Theme, React.ElementType> = {
  light: Sun,
  dark: Moon,
  sepia: Coffee,
};

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { theme, cycleTheme } = usePreferences();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const ThemeIcon = THEME_ICONS[theme];
  const title = mode === "signin" ? "Sign in to Signal" : "Create your Signal account";
  const subtitle = mode === "signin"
    ? "Use your account to access your saved sources, keywords, and feed."
    : "Create an account to start building your personalized news dashboard.";

  const initials = useMemo(() => {
    const value = username.trim();
    return value ? value.slice(0, 1).toUpperCase() : "S";
  }, [username]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password.trim() || (mode === "signup" && !email.trim())) {
      showToast("Please fill in all required fields.", "error");
      return;
    }

    try {
      setSubmitting(true);

      if (mode === "signin") {
        await signIn({
          username: username.trim(),
          password,
          rememberMe,
        });
      } else {
        await signUp({
          username: username.trim(),
          email: email.trim(),
          password,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="signal-app"
      data-theme={theme}
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--sg-bg)",
        color: "var(--sg-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "18px 20px 0",
        }}
      >
        <button
          onClick={cycleTheme}
          aria-label="Cycle theme"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid var(--sg-border)",
            backgroundColor: "var(--sg-surface)",
            color: "var(--sg-muted)",
            cursor: "pointer",
          }}
        >
          <ThemeIcon style={{ width: 15, height: 15 }} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div className="grid w-full max-w-[920px] grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
          <div
            style={{
              backgroundColor: "var(--sg-surface)",
              border: "1px solid var(--sg-border)",
              borderRadius: 20,
              padding: "28px 28px 30px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: 460,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: "var(--sg-logo-bg)",
                    color: "var(--sg-logo-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  <Rss style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Signal</div>
                  <div style={{ fontSize: 12.5, color: "var(--sg-muted)", marginTop: 2 }}>
                    Your news, distilled.
                  </div>
                </div>
              </div>

              <h1
                style={{
                  fontSize: 34,
                  lineHeight: 1.08,
                  fontWeight: 700,
                  letterSpacing: "-0.05em",
                  margin: 0,
                  maxWidth: 420,
                }}
              >
                A quiet, reader-first workspace for following the web.
              </h1>

              <p
                style={{
                  fontSize: 14.5,
                  color: "var(--sg-muted)",
                  lineHeight: 1.7,
                  marginTop: 16,
                  maxWidth: 460,
                }}
              >
                Track sources, save articles, focus the feed with keywords, and switch between feed and
                reader modes without leaving the same calm dashboard.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                "Compact source and article management",
                "Keyword-focused feed filtering",
                "Short, default, and deep-dive summaries",
                "Light, dark, and sepia reading themes",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    borderRadius: 12,
                    border: "1px solid var(--sg-border)",
                    backgroundColor: "var(--sg-bg)",
                    padding: "12px 14px",
                    fontSize: 12.5,
                    color: "var(--sg-text)",
                    lineHeight: 1.5,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              backgroundColor: "var(--sg-surface)",
              border: "1px solid var(--sg-border)",
              borderRadius: 20,
              padding: "24px 24px 22px",
              boxShadow: "0 18px 48px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    backgroundColor: "var(--sg-logo-bg)",
                    color: "var(--sg-logo-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--sg-muted)", marginTop: 3 }}>{subtitle}</div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                padding: 4,
                borderRadius: 999,
                backgroundColor: "var(--sg-bg)",
                border: "1px solid var(--sg-border)",
                marginBottom: 20,
              }}
            >
              {[
                { key: "signin" as const, label: "Sign In", icon: LogIn },
                { key: "signup" as const, label: "Create Account", icon: UserPlus },
              ].map(({ key, label, icon: Icon }) => {
                const isActive = mode === key;
                return (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      height: 38,
                      borderRadius: 999,
                      border: isActive ? "1px solid var(--sg-text)" : "1px solid transparent",
                      backgroundColor: isActive ? "var(--sg-surface)" : "transparent",
                      color: isActive ? "var(--sg-text)" : "var(--sg-muted)",
                      fontSize: 12.5,
                      fontWeight: isActive ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    <Icon style={{ width: 13, height: 13 }} />
                    {label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Username
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="alex_reader"
                  disabled={submitting}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: "1px solid var(--sg-border)",
                    backgroundColor: "var(--sg-bg)",
                    color: "var(--sg-text)",
                    padding: "0 12px",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
              </label>

              {mode === "signup" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="alex@signal.app"
                    disabled={submitting}
                    style={{
                      height: 44,
                      borderRadius: 10,
                      border: "1px solid var(--sg-border)",
                      backgroundColor: "var(--sg-bg)",
                      color: "var(--sg-text)",
                      padding: "0 12px",
                      fontSize: 13.5,
                      outline: "none",
                    }}
                  />
                </label>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={mode === "signin" ? "Enter your password" : "Choose a password"}
                  disabled={submitting}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: "1px solid var(--sg-border)",
                    backgroundColor: "var(--sg-bg)",
                    color: "var(--sg-text)",
                    padding: "0 12px",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
              </label>

              {mode === "signin" && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 20,
                    cursor: submitting ? "default" : "pointer",
                    color: "var(--sg-muted)",
                    fontSize: 12.5,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    disabled={submitting}
                    style={{
                      width: 14,
                      height: 14,
                      accentColor: "var(--sg-fab-bg)",
                    }}
                  />
                  <span>Remember me</span>
                </label>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  marginTop: 4,
                  height: 46,
                  borderRadius: 10,
                  border: "none",
                  backgroundColor: "var(--sg-fab-bg)",
                  color: "var(--sg-fab-color)",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
                    {mode === "signin" ? "Signing in..." : "Creating account..."}
                  </>
                ) : (
                  <>
                    {mode === "signin" ? <LogIn style={{ width: 15, height: 15 }} /> : <UserPlus style={{ width: 15, height: 15 }} />}
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
