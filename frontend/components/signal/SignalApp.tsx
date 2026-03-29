"use client";

import { MemoryRouter } from "react-router-dom";
import { PreferencesProvider } from "./context/PreferencesContext";
import { AppStateProvider } from "./context/AppStateContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./layout/AppLayout";

export function SignalApp() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <PreferencesProvider>
        <AppStateProvider>
          <ToastProvider>
            <AppLayout />
          </ToastProvider>
        </AppStateProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}
