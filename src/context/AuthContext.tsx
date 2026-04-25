import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SEED_USERS } from "../data/seed";
import { ApiError, apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { STORAGE_EXTRA_USERS, STORAGE_SESSION_USER_ID } from "../lib/storageKeys";
import type { DemoUser, ModuleKey, SessionUser, UserRole } from "../types/user";

export type CreateUserInput = {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  regionId: string;
  storeId: string | null;
  canLogin: boolean;
  moduleAccessOverride: ModuleKey[] | null;
};

type AuthContextValue = {
  user: SessionUser | null;
  /** Hydration / API session restore */
  authReady: boolean;
  listUsers: SessionUser[];
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function stripPassword(u: DemoUser): SessionUser {
  const { password: _p, ...rest } = u;
  return rest;
}

function loadExtraUsers(): DemoUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_EXTRA_USERS);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoUser[];
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveExtraUsers(users: DemoUser[]) {
  localStorage.setItem(STORAGE_EXTRA_USERS, JSON.stringify(users));
}

function readSessionUserId(): string | null {
  return localStorage.getItem(STORAGE_SESSION_USER_ID);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const [extraUsers, setExtraUsers] = useState<DemoUser[]>(() => (api ? [] : loadExtraUsers()));
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => (api ? null : readSessionUserId()));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [listUsers, setListUsers] = useState<SessionUser[]>([]);
  const [authReady, setAuthReady] = useState(!api);

  const allWithPassword = useMemo(() => [...SEED_USERS, ...extraUsers], [extraUsers]);

  const localUser: SessionUser | null = useMemo(() => {
    if (api) return null;
    if (!sessionUserId) return null;
    const found = allWithPassword.find((u) => u.id === sessionUserId);
    return found ? stripPassword(found) : null;
  }, [api, sessionUserId, allWithPassword]);

  const effectiveUser = api ? user : localUser;

  const refreshDirectory = useCallback(async (actor: SessionUser | null) => {
    if (!api || !actor) {
      setListUsers([]);
      return;
    }
    if (actor.role !== "super_admin" && actor.role !== "regional_admin" && actor.role !== "ho_admin") {
      setListUsers([]);
      return;
    }
    try {
      const data = await apiJson<{ users: SessionUser[] }>("/api/users");
      setListUsers(data.users);
    } catch {
      setListUsers([]);
    }
  }, [api]);

  useEffect(() => {
    if (!api) {
      setAuthReady(true);
      setUser(null);
      setListUsers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await apiJson<{ user: SessionUser | null }>("/api/auth/me");
        if (cancelled) return;
        setUser(me.user);
        await refreshDirectory(me.user);
      } catch {
        if (!cancelled) {
          setUser(null);
          setListUsers([]);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, refreshDirectory]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (api) {
        try {
          const data = await apiJson<{ ok: boolean; user?: SessionUser; message?: string }>(
            "/api/auth/login",
            {
              method: "POST",
              json: { email, password },
            },
          );
          if (!data.ok || !data.user) {
            return { ok: false, message: data.message ?? "Login failed." };
          }
          setUser(data.user);
          await refreshDirectory(data.user);
          return { ok: true };
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Invalid email or password.";
          return { ok: false, message: msg };
        }
      }

      const normalized = email.trim().toLowerCase();
      const found = allWithPassword.find(
        (u) => u.email.toLowerCase() === normalized && u.password === password,
      );
      if (!found) return { ok: false, message: "Invalid email or password." };
      if (found.canLogin === false) {
        return { ok: false, message: "This profile is directory-only and cannot sign in." };
      }
      localStorage.setItem(STORAGE_SESSION_USER_ID, found.id);
      setSessionUserId(found.id);
      return { ok: true };
    },
    [api, allWithPassword, refreshDirectory],
  );

  const logout = useCallback(async () => {
    if (api) {
      try {
        await apiJson("/api/auth/logout", { method: "POST" });
      } catch {
        /* ignore */
      }
      setUser(null);
      setListUsers([]);
      return;
    }
    localStorage.removeItem(STORAGE_SESSION_USER_ID);
    setSessionUserId(null);
  }, [api]);

  const createUser = useCallback(
    async (input: CreateUserInput): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (api) {
        try {
          await apiJson("/api/users", { method: "POST", json: input });
          await refreshDirectory(effectiveUser);
          return { ok: true };
        } catch (e) {
          const msg =
            e instanceof ApiError && typeof e.body === "object" && e.body !== null && "message" in e.body
              ? String((e.body as { message: string }).message)
              : e instanceof ApiError
                ? e.message
                : "Could not create user.";
          return { ok: false, message: msg };
        }
      }

      const actor = allWithPassword.find((u) => u.id === sessionUserId);
      if (!actor) return { ok: false, message: "Not signed in." };

      const email = input.email.trim().toLowerCase();
      if (!input.displayName.trim()) return { ok: false, message: "Display name is required." };
      if (input.canLogin) {
        if (!email) return { ok: false, message: "Email is required for login-enabled users." };
        if (input.password.length < 4) return { ok: false, message: "Password must be at least 4 characters." };
      }

      if (email && allWithPassword.some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, message: "An account with this email already exists." };
      }

      if (actor.role === "regional_admin") {
        if (input.regionId !== actor.regionId) {
          return { ok: false, message: "You can only add users in your region." };
        }
      } else if (actor.role !== "super_admin" && actor.role !== "ho_admin") {
        return { ok: false, message: "You do not have permission to create users." };
      }

      if (actor.role === "ho_admin") {
        if (input.role === "super_admin" || input.role === "regional_admin") {
          return { ok: false, message: "HO Admin cannot assign super admin or regional admin roles." };
        }
        if (actor.regionId && input.regionId !== actor.regionId) {
          return { ok: false, message: "HO Admin may only create users in the same HO region as their account." };
        }
        if (!actor.regionId) {
          return { ok: false, message: "Your HO Admin account has no region; user creation is disabled." };
        }
      }

      if ((input.role === "store_user" || input.role === "store_purchase_user" || input.role === "store_manager" || input.role === "store_accounts") && !input.storeId) {
        return { ok: false, message: "Store is required for store roles." };
      }

      const newUser: DemoUser = {
        id: createId("user"),
        email: email || `${createId("user")}@directory.local`,
        password: input.password || createId("pwd"),
        displayName: input.displayName.trim(),
        role: input.role,
        regionId: input.regionId,
        storeId:
          input.role === "store_user" ||
          input.role === "store_purchase_user" ||
          input.role === "store_manager" ||
          input.role === "store_accounts"
            ? input.storeId
            : null,
        technicianProfileId: null,
        canLogin: input.canLogin,
        moduleAccessOverride: input.moduleAccessOverride,
        createdAt: new Date().toISOString(),
      };

      const next = [...extraUsers, newUser];
      setExtraUsers(next);
      saveExtraUsers(next);
      return { ok: true };
    },
    [api, allWithPassword, extraUsers, sessionUserId, effectiveUser, refreshDirectory],
  );

  const value = useMemo(
    () => ({
      user: effectiveUser,
      authReady,
      listUsers: api ? listUsers : allWithPassword.map(stripPassword),
      login,
      logout,
      createUser,
    }),
    [effectiveUser, authReady, api, listUsers, allWithPassword, login, logout, createUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useVisibleUsers(): SessionUser[] {
  const { user, listUsers } = useAuth();
  if (!user) return [];
  if (user.role === "super_admin") return listUsers;
  if (user.role === "regional_admin") {
    return listUsers.filter((u) => u.regionId === user.regionId);
  }
  if (user.role === "ho_admin") {
    if (user.regionId) return listUsers.filter((u) => u.regionId === user.regionId);
    return listUsers;
  }
  return [];
}
