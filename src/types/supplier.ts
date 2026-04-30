export type SupplierLocation = {
  doorNo: string;
  street: string;
  place: string;
  district: string;
  state: string;
  pinCode: string;
};

export type Supplier = {
  id: string;
  supplierCode: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  locations?: SupplierLocation[];
  gst: string | null;
  taxPersonType?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
