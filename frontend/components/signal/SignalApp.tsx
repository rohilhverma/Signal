"use client";

import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { AppStateProvider } from "./context/AppStateContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./layout/AppLayout";

function SignalBootstrap() {
  const { isAuthenticated, isInitializing } = useAuth();

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

  // Single-user local build: there is no login. If the user could not be loaded the API
  // is unreachable or app.single-user.username is not set, so say that rather than
  // rendering an empty dashboard.
  if (!isAuthenticated) {
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
        <div>
          Check that the Spring app is running on :8080 and that
          {" "}<code>app.single-user.username</code> names an existing account.
        </div>
      </div>
    );
  }

  return (
    <AppStateProvider>
      <AppLayout />
    </AppStateProvider>
  );
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
