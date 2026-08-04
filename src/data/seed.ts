import type { DemoUser } from "../types/user";

export type SeedStore = {
  id: string;
  name: string;
  /** Printed invoice — trading name (e.g. ZIMSON - THE WATCH STORE). */
  invoiceDisplayName?: string;
  invoiceTagline?: string;
  /** Multiline address for invoice header. */
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceEmail?: string;
  invoiceGstin?: string;
  /** “For …” signatory line. */
  invoiceLegalEntityName?: string;
  /** Numbered terms: one paragraph per line. */
  invoiceTerms?: string;
  /** Short code for invoice numbers (e.g. CHN01). If empty, derived from store name. */
  invoiceNumberStoreCode?: string;
};

export type SeedWarehouse = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
};

/** Structured office address — mirrors CustomerAddressBlock fields. */
export type RegionAddressBlock = {
  doorNo: string;
  street: string;
  city: string;
  district: string;
  state: string;
  country: string;
  pincode: string;
};

export type SeedRegion = {
  id: string;
  name: string;
  /** Short code used in invoice numbers, e.g. CHN, CBE */
  regionCode?: string;
  address?: string;
  gst?: string;
  pan?: string;
  email?: string;
  phone?: string;
  /** Structured office address (preferred). */
  addressJson?: RegionAddressBlock;
  stores: SeedStore[];
  warehouses: SeedWarehouse[];
};

export const SEED_REGIONS: SeedRegion[] = [];

export const SEED_USERS: DemoUser[] = [
  {
    id: "seed-super-1",
    employeeCode: "SA001",
    email: "superadmin@zimson.demo",
    password: "super123",
    displayName: "Super Admin",
    role: "super_admin",
    regionId: null,
    storeId: null,
    canLogin: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    isSeed: true,
  },
];
