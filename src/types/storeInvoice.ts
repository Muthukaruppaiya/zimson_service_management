import type { SeedStore } from "../data/seed";

/** Overrides for printed invoice seller block (from `stores` row). */
export type StoreInvoicePrintProfile = {
  invoiceStoreDisplayName: string;
  invoiceStoreTagline: string;
  invoiceStoreAddress: string;
  invoiceStorePhone: string;
  invoiceStoreEmail: string;
  invoiceStoreGstin: string;
  invoiceLegalEntityName: string;
  invoiceTerms: string;
};

export function seedStoreToInvoiceProfile(store: SeedStore | null | undefined): StoreInvoicePrintProfile | null {
  if (!store) return null;
  return {
    invoiceStoreDisplayName: (store.invoiceDisplayName ?? "").trim(),
    invoiceStoreTagline: (store.invoiceTagline ?? "").trim(),
    invoiceStoreAddress: (store.invoiceAddress ?? "").trim(),
    invoiceStorePhone: (store.invoicePhone ?? "").trim(),
    invoiceStoreEmail: (store.invoiceEmail ?? "").trim(),
    invoiceStoreGstin: (store.invoiceGstin ?? "").trim(),
    invoiceLegalEntityName: (store.invoiceLegalEntityName ?? "").trim(),
    invoiceTerms: (store.invoiceTerms ?? "").trim(),
  };
}
