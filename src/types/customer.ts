export type CustomerKind = "B2C" | "B2B";

export type CustomerRecord = {
  id: string;
  displayName: string;
  phone: string;
  alternatePhone?: string;
  email: string;
  address?: string;
  city?: string;
  customerKind: CustomerKind;
  company?: string;
  gst?: string;
  pan?: string;
  createdAt: string;
  isSeed?: boolean;
};
