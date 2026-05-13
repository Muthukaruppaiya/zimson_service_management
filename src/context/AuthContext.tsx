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
  employeeCode: string;
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  regionId: string;
  storeId: string | null;
  storeIds?: string[];
  canLogin: boolean;
  moduleAccessOverride: ModuleKey[] | null;
};

type LoginResult =
  | { ok: true }
  | { ok: false; message: string }
  | { ok: false; message: string; code: "STORE_SELECTION_REQUIRED"; stores: { id: string; name: string }[] };

export type UserPatchInput = Partial<{
  displayName: string;
  email: string;
  employeeCode: string;
  role: import("../types/user").UserRole;
  regionId: string;
  storeId: string | null;
  storeIds: string[];
  canLogin: boolean;
  moduleAccessOverride: import("../types/user").ModuleKey[] | null;
  password: string;
}>;

type AuthContextValue = {
  user: SessionUser | null;
  /** Hydration / API session restore */
  authReady: boolean;
  listUsers: SessionUser[];
  login: (employeeCode: string, password: string, storeId?: string | null) => Promise<LoginResult>;
  logout: () => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<{ ok: true } | { ok: false; message: string }>;
  updateUser: (userId: string, patch: UserPatchInput) => Promise<{ ok: boolean; message: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function userEmployeeCode(u: DemoUser): string {
  const raw = String(u.employeeCode ?? u.id).trim().toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

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
    if (actor.role !== "super_admin" && actor.role !== "admin") {
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
    async (employeeCode: string, password: string, storeId?: string | null): Promise<LoginResult> => {
      if (api) {
        try {
          const data = await apiJson<{ ok: boolean; user?: SessionUser; message?: string; code?: string; stores?: { id: string; name: string }[] }>(
            "/api/auth/login",
            {
              method: "POST",
              json: { employeeCode, password, storeId: storeId ?? null },
            },
          );
          if (!data.ok && data.code === "STORE_SELECTION_REQUIRED" && Array.isArray(data.stores)) {
            return {
              ok: false,
              code: "STORE_SELECTION_REQUIRED",
              message: data.message ?? "Select a store to continue login.",
              stores: data.stores,
            };
          }
          if (!data.ok || !data.user) {
            return { ok: false, message: data.message ?? "Login failed." };
          }
          setUser(data.user);
          await refreshDirectory(data.user);
          return { ok: true };
        } catch (e) {
          if (
            e instanceof ApiError &&
            typeof e.body === "object" &&
            e.body !== null &&
            "code" in e.body
          ) {
            const body = e.body as Record<string, unknown>;
            if (body.code !== "STORE_SELECTION_REQUIRED" || !Array.isArray(body.stores)) {
              const msg = e.message;
              return { ok: false, message: msg };
            }
            return {
              ok: false,
              code: "STORE_SELECTION_REQUIRED",
              message: typeof body.message === "string" ? body.message : "Select a store to continue login.",
              stores: body.stores as { id: string; name: string }[],
            };
          }
          const msg = e instanceof ApiError ? e.message : "Invalid employee number or password.";
          return { ok: false, message: msg };
        }
      }

      const normalized = employeeCode.trim().toUpperCase();
      const found = allWithPassword.find(
        (u) => userEmployeeCode(u) === normalized && u.password === password,
      );
      if (!found) return { ok: false, message: "Invalid employee number or password." };
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
      const employeeCode = input.employeeCode.trim().toUpperCase();
      if (!input.displayName.trim()) return { ok: false, message: "Display name is required." };
      if (input.canLogin) {
        if (!employeeCode) return { ok: false, message: "Employee number is required for login-enabled users." };
        if (input.password.length < 4) return { ok: false, message: "Password must be at least 4 characters." };
      }
      if (employeeCode && allWithPassword.some((u) => userEmployeeCode(u) === employeeCode)) {
        return { ok: false, message: "An account with this employee number already exists." };
      }

      if (email && allWithPassword.some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, message: "An account with this email already exists." };
      }

      if (actor.role === "admin") {
        if (input.regionId !== actor.regionId) {
          return { ok: false, message: "You can only add users in your region." };
        }
      } else if (actor.role !== "super_admin" && actor.role !== "admin") {
        return { ok: false, message: "You do not have permission to create users." };
      }

      if (actor.role === "admin") {
        if (input.role === "super_admin" || input.role === "admin") {
          return { ok: false, message: "Admin cannot assign Super Admin or Admin roles." };
        }
        if (actor.regionId && input.regionId !== actor.regionId) {
          return { ok: false, message: "HO Admin may only create users in the same HO region as their account." };
        }
        if (!actor.regionId) {
          return { ok: false, message: "Your HO Admin account has no region; user creation is disabled." };
        }
      }

      const storeIds = Array.isArray(input.storeIds) && input.storeIds.length > 0
        ? input.storeIds
        : input.storeId
          ? [input.storeId]
          : [];
      if ((input.role === "store_user" || input.role === "store_user" || input.role === "store_manager" || input.role === "store_accounts") && storeIds.length === 0) {
        return { ok: false, message: "At least one store is required for store roles." };
      }

      const newUser: DemoUser = {
        id: createId("user"),
        employeeCode: employeeCode || createId("emp").toUpperCase(),
        email: email || `${createId("user")}@directory.local`,
        password: input.password || createId("pwd"),
        displayName: input.displayName.trim(),
        role: input.role,
        regionId: input.regionId,
        storeId:
          input.role === "store_user" ||
          input.role === "store_user" ||
          input.role === "store_manager" ||
          input.role === "store_accounts"
            ? storeIds[0] ?? null
            : null,
        storeIds:
          input.role === "store_user" ||
          input.role === "store_user" ||
          input.role === "store_manager" ||
          input.role === "store_accounts"
            ? storeIds
            : [],
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

  const updateUser = useCallback(
    async (userId: string, patch: UserPatchInput): Promise<{ ok: boolean; message: string }> => {
      if (api) {
        try {
          await apiJson(`/api/users/${encodeURIComponent(userId)}`, { method: "PATCH", json: patch });
          await refreshDirectory(effectiveUser);
          return { ok: true, message: "User updated." };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : "Could not update user." };
        }
      }
      // Local (non-API) mode — patch in extraUsers
      setExtraUsers((prev) => {
        const next = prev.map((u) => {
          if (u.id !== userId) return u;
          return {
            ...u,
            displayName: patch.displayName ?? u.displayName,
            email: patch.email ?? u.email,
            employeeCode: patch.employeeCode ?? u.employeeCode,
            role: patch.role ?? u.role,
            regionId: "regionId" in patch ? (patch.regionId ?? null) : u.regionId,
            storeId: "storeId" in patch ? patch.storeId ?? null : u.storeId,
            storeIds: patch.storeIds ?? u.storeIds,
            canLogin: patch.canLogin ?? u.canLogin,
            moduleAccessOverride: "moduleAccessOverride" in patch ? patch.moduleAccessOverride : u.moduleAccessOverride,
          };
        });
        saveExtraUsers(next);
        return next;
      });
      return { ok: true, message: "User updated." };
    },
    [api, effectiveUser, refreshDirectory],
  );

  const value = useMemo(
    () => ({
      user: effectiveUser,
      authReady,
      listUsers: api ? listUsers : allWithPassword.map(stripPassword),
      login,
      logout,
      createUser,
      updateUser,
    }),
    [effectiveUser, authReady, api, listUsers, allWithPassword, login, logout, createUser, updateUser],
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
  if (user.role === "admin") {
    return listUsers.filter((u) => u.regionId === user.regionId);
  }
  if (user.role === "admin") {
    if (user.regionId) return listUsers.filter((u) => u.regionId === user.regionId);
    return listUsers;
  }
  return [];
}
