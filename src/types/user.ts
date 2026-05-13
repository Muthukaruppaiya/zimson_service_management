export type UserRole =
  | "super_admin"
  | "admin"
  | "ho_manager"
  | "ho_accounts"
  | "ho_purchase"
  | "service_centre_clerk"
  | "service_centre_supervisor"
  | "store_user"
  | "store_manager"
  | "store_accounts"
  | "technician";

/** App sections tied to routes; adjust visibility per role in `config/moduleAccess.ts`. */
export type ModuleKey =
  | "dashboard"
  | "service"
  | "accounts"
  | "regions"
  | "users"
  | "service_centre"
  | "inventory"
  | "settings";

export type DemoUser = {
  id: string;
  employeeCode?: string;
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  /** Set for admin, store_user, and service centre roles scoped to a region / HO */
  regionId: string | null;
  /** Set for store_user */
  storeId: string | null;
  /** Optional multi-store access for store roles. */
  storeIds?: string[];
  /** For technician role — matches `SEED_TECHNICIANS` id */
  technicianProfileId?: string | null;
  /** If false, account is directory-only and cannot sign in (e.g. technicians). */
  canLogin?: boolean;
  /** Optional per-user module customization set by admin. */
  moduleAccessOverride?: ModuleKey[] | null;
  createdAt: string;
  /** Built-in accounts cannot be removed from the demo */
  isSeed?: boolean;
};

export type SessionUser = Omit<DemoUser, "password">;
