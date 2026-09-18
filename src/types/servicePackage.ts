export type WatchServiceKind = "quartz" | "mechanical";

export type ServicePackageSpare = {
  spareId: string;
  name: string;
  sku: string;
  qty: number;
};

export type ServicePackage = {
  id: string;
  brand: string;
  serviceType: WatchServiceKind;
  packageType: string;
  priceInr: number;
  isActive: boolean;
  spares: ServicePackageSpare[];
  createdAt?: string;
  updatedAt?: string;
};

/** Snapshot stored on the SRF when a package is applied at work-done. */
export type SrfServicePackageSnapshot = {
  id: string;
  brand: string;
  serviceType: WatchServiceKind;
  packageType: string;
  priceInr: number;
  spareIds: string[];
  spareNames: string[];
};
