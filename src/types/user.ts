export type UserRole =
  | "ho_admin"
  | "ho_manager"
  | "ho_supervisor"
  | "ho_user"
  | "ho_accounts"
  | "super_admin"
  | "regional_admin"
  | "store_user"
  | "store_purchase_user"
  | "store_manager"
  | "store_accounts"
  | "service_centre_clerk"
  | "service_centre_supervisor"
  | "service_centre_inward"
  | "service_centre_outward"
  | "technician";

/** App sections tied to routes; adjust visibility per role in `config/moduleAccess.ts`. */
export type ModuleKey =
  | "dashboard"
  | "service"
  | "regions"
  | "users"
  | "service_centre"
  | "inventory"
  | "settings";

export type DemoUser = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  /** Set for regional_admin, store_user, and service centre roles scoped to a region / HO */
  regionId: string | null;
  /** Set for store_user */
  storeId: string | null;
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
