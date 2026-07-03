export type BrandEwayConsignee = {
  id: string;
  brandId: string;
  brandName: string;
  locationName: string;
  legalName: string;
  gstin: string;
  address: string;
  city: string;
  pincode: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BrandEwayConsigneeOption = Pick<
  BrandEwayConsignee,
  "id" | "brandId" | "brandName" | "locationName" | "legalName" | "gstin" | "address" | "city" | "pincode"
>;
