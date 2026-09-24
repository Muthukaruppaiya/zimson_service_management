export type WatchServiceKind = "quartz" | "mechanical";

export type ServicePackageSpare = {
  spareId: string;
  name: string;
  sku: string;
  qty: number;
  salePriceInr: number;
};

export type ServicePackage = {
  id: string;
  brand: string;
  name: string;
  serviceType: WatchServiceKind;
  packageType: string;
  priceInr: number;
  isActive: boolean;
  spares: ServicePackageSpare[];
  createdAt?: string;
  updatedAt?: string;
};

export type ServicePackageType = {
  id: string;
  name: string;
  isActive: boolean;
};

/** Snapshot stored on the SRF when a package is applied at work-done. */
export type SrfServicePackageSnapshot = {
  id: string;
  brand: string;
  name?: string;
  serviceType: WatchServiceKind;
  packageType: string;
  priceInr: number;
  spareIds: string[];
  spareNames: string[];
};
