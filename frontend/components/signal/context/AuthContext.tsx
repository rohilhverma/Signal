"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface AuthUser {
  username: string;
  email: string;
  websites: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  /**
   * Set when the first load failed because the API could not be reached at all, as opposed to
   * answering "not authenticated". `user === null` cannot tell those apart, and advising
   * someone to sign in while the server is down sends them looking in the wrong place.
   */
  bootstrapError: "unreachable" | null;
  signIn: (credentials: { username: string; password: string; rememberMe: boolean }) => Promise<void>;
  signUp: (credentials: { username: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readResponseMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `Request failed (${response.status})`;
}

async function requestCurrentUser(): Promise<Response> {
  return fetch("/api/user/info", {
    credentials: "include",
  });
}

async function requestRefresh(): Promise<Response> {
  return fetch("/auth/refresh", {
    method: "POST",
    credentials: "include",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<"unreachable" | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
  }, []);

  const refreshSession = useCallback(() => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const response = await requestRefresh();
        return response.ok;
      } catch {
        return false;
      }
    })();

    refreshInFlightRef.current = refreshPromise.finally(() => {
      refreshInFlightRef.current = null;
    });

    return refreshInFlightRef.current;
  }, []);

  const loadCurrentUser = useCallback(
    async (allowRefresh: boolean) => {
      const response = await requestCurrentUser();
      if (response.ok) {
        return response.json() as Promise<AuthUser>;
      }

      if (response.status === 401 && allowRefresh) {
        const refreshed = await refreshSession();
        if (!refreshed) {
          throw new Error("Your session has expired.");
        }

        const retryResponse = await requestCurrentUser();
        if (!retryResponse.ok) {
          throw new Error(await readResponseMessage(retryResponse));
        }

        return retryResponse.json() as Promise<AuthUser>;
      }

      throw new Error(await readResponseMessage(response));
    },
    [refreshSession]
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      clearSession();
    }
  }, [clearSession]);
  
  const commitSession = useCallback(
    async (allowRefresh: boolean) => {
      const nextUser = await loadCurrentUser(allowRefresh);
      setUser(nextUser);
    },
    [loadCurrentUser]
  );

  const refreshUser = useCallback(async () => {
    try {
      await commitSession(true);
    } catch (error) {
      clearSession();
      throw error;
    }
  }, [clearSession, commitSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsInitializing(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextUser = await loadCurrentUser(true);
        if (cancelled) {
          return;
        }
        setUser(nextUser);
      } catch (error) {
        if (cancelled) {
          return;
        }
        clearSession();
        // fetch rejects with a TypeError when the request never arrived at all; every other
        // failure here means the API answered, and the answer was "not authenticated".
        setBootstrapError(error instanceof TypeError ? "unreachable" : null);
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession, loadCurrentUser]);

  const authenticate = useCallback(
    async (endpoint: string, payload: Record<string, string | boolean>) => {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Incorrect username or password."
            : await readResponseMessage(response)
        );
      }

      try {
        await commitSession(false);
      } catch (error) {
        await signOut();
        throw error;
      }
    },
    [commitSession, signOut]
  );

  const signIn = useCallback(
    async (credentials: { username: string; password: string; rememberMe: boolean }) => {
      await authenticate("/auth/signin", credentials);
    },
    [authenticate]
  );

  const signUp = useCallback(
    async (credentials: { username: string; email: string; password: string }) => {
      await authenticate("/auth/signup", { ...credentials, rememberMe: false });
    },
    [authenticate]
  );

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);

      const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
      if (init.body && !isFormData && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const execute = () =>
        fetch(input, {
          ...init,
          credentials: "include",
          headers,
        });

      const response = await execute();
      if (response.status !== 401) {
        return response;
      }

      const refreshed = await refreshSession();
      if (!refreshed) {
        await signOut();
        throw new Error("Your session has expired.");
      }

      const retryResponse = await execute();
      if (retryResponse.status === 401) {
        await signOut();
        throw new Error("Your session has expired.");
      }

      return retryResponse;
    },
    [refreshSession, signOut]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      bootstrapError,
      signIn,
      signUp,
      signOut,
      authenticatedFetch,
      refreshUser,
    }),
    [authenticatedFetch, bootstrapError, isInitializing, refreshUser, signIn, signOut, signUp, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
