"use client";

// ─── Login ─────────────────────────────────────────────────────────────────────
//
// The one screen that runs before authentication. Signing in is a single POST to
// /auth/signin, which answers with httpOnly cookies and no body, so there is nothing here to
// store: on success `signIn` has already re-read /api/user/info, and isAuthenticated flipping
// is what swaps this screen for the app.
//
// A wrong password and an unreachable API both fail on this form and are worth telling apart -
// "Incorrect username or password" sends a reader back to their keyboard, "is the Spring app
// running" sends them to a terminal.

import { useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "./context/AuthContext";

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontSize: 12,
  color: "var(--sg-muted, #706a60)",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  fontSize: 13.5,
  color: "var(--sg-text, #2b2721)",
  backgroundColor: "var(--sg-bg, #faf8f5)",
  border: "1px solid var(--sg-border, #e8e3da)",
  borderRadius: 8,
};

function messageFor(error: unknown): string {
  if (error instanceof TypeError) {
    return "Couldn't reach the Signal API. Check that the Spring app is running on :8080.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Sign-in failed. Try again.";
}

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const disabled = submitting || username.trim().length === 0 || password.length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signIn({ username: username.trim(), password, rememberMe });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="signal-app"
      data-theme="light"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "var(--sg-bg, #faf8f5)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 24,
          backgroundColor: "var(--sg-surface, #fffdf9)",
          border: "1px solid var(--sg-border, #e8e3da)",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: "var(--sg-text, #2b2721)",
            }}
          >
            Signal
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--sg-muted, #706a60)" }}>
            Sign in to read your feed.
          </p>
        </div>

        <div>
          <label style={labelStyle} htmlFor="login-username">
            Username
          </label>
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={fieldStyle}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={fieldStyle}
          />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12.5,
            color: "var(--sg-muted, #706a60)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Keep me signed in
        </label>

        {error && (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#b4231f" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={disabled}
          style={{
            padding: "9px 12px",
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--sg-fab-color, #ffffff)",
            backgroundColor: "var(--sg-fab-bg, #2c2c2a)",
            border: "none",
            borderRadius: 8,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
