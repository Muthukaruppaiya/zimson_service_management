export type BrandRow = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
};

export type SpareBrandMrpLine = {
  id: string;
  spareId: string;
  brandId: string;
  brandCode: string;
  brandName: string;
  mrpInr: number;
  currency: string;
};

export type SpareStockRow = {
  id: string;
  spareId: string;
  sku: string;
  locationKey: string;
  quantity: number;
  updatedAt: string;
};
