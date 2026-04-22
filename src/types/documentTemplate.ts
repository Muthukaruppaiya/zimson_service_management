export type DocumentBranding = {
  companyName: string;
  companySlogan: string;
  companyAddress: string;
  companyCityStateZip: string;
  companyPhone: string;
  companyEmail: string;
  companyLogoUrl: string;
};

export type DocumentKind = "po" | "pr" | "grn" | "transfer";

export type DynamicDocumentTemplate = {
  id: string;
  kind: DocumentKind;
  name: string;
  title: string;
  titleAlign: "left" | "center" | "right";
  defaultTerms: string;
  signLabelPrimary: string;
  signLabelSecondary: string;
  labels: Record<string, string>;
};

export type DocumentTemplateStore = {
  branding: DocumentBranding;
  templatesByKind: Record<DocumentKind, DynamicDocumentTemplate[]>;
  activeTemplateIdByKind: Record<DocumentKind, string>;
};

