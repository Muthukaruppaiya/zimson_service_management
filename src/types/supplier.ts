/** A place of business. Several branches can share one supplier GSTIN (same state, different addresses). */
export type SupplierLocation = {
  id?: string;
  branchName?: string;
  branchCode?: string;
  contactName?: string;
  phone?: string;
  email?: string;
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
  /** Second number when Phone has "4347777 / 4347700" or a dedicated Alternate Phone column. */
  alternatePhone?: string | null;
  address: string | null;
  locations?: SupplierLocation[];
  gst: string | null;
  taxPersonType?: string | null;
  isActive: boolean;
  customFields?: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
};
