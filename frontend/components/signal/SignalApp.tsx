"use client";

import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { AppStateProvider } from "./context/AppStateContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./layout/AppLayout";
import { LoginScreen } from "./LoginScreen";

function SignalBootstrap() {
  const { isAuthenticated, isInitializing, bootstrapError } = useAuth();

  if (isInitializing) {
    return (
      <div
        className="signal-app"
        data-theme="light"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--sg-bg, #faf8f5)",
          color: "var(--sg-muted, #706a60)",
          fontSize: 13.5,
        }}
      >
        Loading Signal...
      </div>
    );
  }

  // Signed out and unreachable are different problems, and "sign in" is the wrong advice for
  // the second one. isAuthenticated is checked first, so a sign-in that succeeds after a
  // failed first load renders the app rather than a stale diagnostic.
  if (isAuthenticated) {
    return (
      <AppStateProvider>
        <AppLayout />
      </AppStateProvider>
    );
  }

  if (bootstrapError === "unreachable") {
    return (
      <div
        className="signal-app"
        data-theme="light"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: "var(--sg-bg, #faf8f5)",
          color: "var(--sg-muted, #706a60)",
          fontSize: 13.5,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontWeight: 600, color: "var(--sg-text, #2b2721)" }}>
          Can&apos;t reach the Signal API
        </div>
        <div>Check that the Spring app is running on :8080.</div>
      </div>
    );
  }

  return <LoginScreen />;
}

export function SignalApp() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <PreferencesProvider>
        <AuthProvider>
          <ToastProvider>
            <SignalBootstrap />
          </ToastProvider>
        </AuthProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}
