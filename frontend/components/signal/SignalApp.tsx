"use client";

import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { AppStateProvider } from "./context/AppStateContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./layout/AppLayout";
import { AuthPage } from "./pages/AuthPage";

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

  if (!isAuthenticated) {
    return <AuthPage />;
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
