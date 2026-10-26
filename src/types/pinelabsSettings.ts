export type PinelabsEnvironment = "uat" | "production";

export type PinelabsStoreSettings = {
  storeId: string;
  storeName: string;
  regionId: string;
  regionName: string;
  enabled: boolean;
  environment: PinelabsEnvironment;
  merchantId: string;
  hasSecurityToken: boolean;
  pineLabsStoreId: string;
  clientId: string;
  imei: string;
  storeCode: string;
  merchantStorePosCode: string;
  configured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};
