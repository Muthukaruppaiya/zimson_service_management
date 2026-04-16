export type UserRole =
  | "super_admin"
  | "regional_admin"
  | "store_user"
  | "service_centre_clerk"
  | "service_centre_supervisor"
  | "technician";

/** App sections tied to routes; adjust visibility per role in `config/moduleAccess.ts`. */
export type ModuleKey =
  | "dashboard"
  | "service"
  | "regions"
  | "users"
  | "service_centre"
  | "inventory";

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
  createdAt: string;
  /** Built-in accounts cannot be removed from the demo */
  isSeed?: boolean;
};

export type SessionUser = Omit<DemoUser, "password">;
