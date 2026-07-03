export type EdocGlobalSettings = {
  failOpen: boolean;
  ewayAutoEnabled: boolean;
  ewayNominalValueInr: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type RegionEdocSettings = {
  regionId: string;
  regionName: string;
  regionGstin: string;
  enabled: boolean;
  username: string;
  hasPassword: boolean;
  ewayUsername: string;
  hasEwayPassword: boolean;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  sellerGstinOverride: string;
  ewayUserGstin: string;
  configured: boolean;
  sandboxMode: boolean;
  effectiveEwayGstin: string;
  effectiveEinvoiceGstin: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** @deprecated Legacy combined settings — use EdocGlobalSettings + RegionEdocSettings */
export type EdocSettings = {
  enabled: boolean;
  failOpen: boolean;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  sellerGstinOverride: string;
  ewayUserGstin: string;
  ewayNominalValueInr: number;
  ewayAutoEnabled: boolean;
  username: string;
  hasPassword: boolean;
  ewayUsername: string;
  hasEwayPassword: boolean;
  configured: boolean;
  configuredFromDatabase: boolean;
  envFallbackActive: boolean;
  sandboxMode: boolean;
  effectiveEwayGstin: string;
  effectiveEinvoiceGstin: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type EdocSettingsBundle = {
  global: EdocGlobalSettings;
  regions: RegionEdocSettings[];
};
