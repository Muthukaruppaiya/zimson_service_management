export type PinelabsEnvironment = "uat" | "production";

/** `pos_imei` = MerchantStorePosCode + IMEI; `store_client` = StoreId + ClientId. */
export type PinelabsConnectionMode = "pos_imei" | "store_client";

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
  connectionMode: PinelabsConnectionMode | null;
  configured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};
