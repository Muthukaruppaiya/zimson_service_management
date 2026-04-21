import { createId } from "./id";
import type {
  DocumentBranding,
  DocumentKind,
  DocumentTemplateStore,
  DynamicDocumentTemplate,
} from "../types/documentTemplate";

const STORAGE_KEY = "zimson.document-template-settings.v1";

export const DEFAULT_DOCUMENT_BRANDING: DocumentBranding = {
  companyName: "Zimson Service Management",
  companySlogan: "Inventory & Service Operations",
  companyAddress: "No. 1, Main Road",
  companyCityStateZip: "Chennai, Tamil Nadu 600001",
  companyPhone: "044-2222 3333",
  companyEmail: "ops@zimson.demo",
};

type FieldRef = { key: string; label: string };

const FIELD_REFS: Record<DocumentKind, FieldRef[]> = {
  po: [
    { key: "toLabel", label: "TO section title" },
    { key: "shipToLabel", label: "SHIP TO section title" },
    { key: "numberLabel", label: "PO number label" },
    { key: "dateLabel", label: "PO date label" },
    { key: "requisitionerLabel", label: "Requisitioner label" },
    { key: "shippedViaLabel", label: "Shipped via label" },
    { key: "fobLabel", label: "FOB point label" },
    { key: "termsLabel", label: "Terms label" },
  ],
  pr: [
    { key: "organizationLabel", label: "Organization label" },
    { key: "documentNoLabel", label: "Document no label" },
    { key: "departmentLabel", label: "Department label" },
    { key: "revisionLabel", label: "Revision label" },
    { key: "sectionLabel", label: "Section label" },
    { key: "sheetLabel", label: "Sheet label" },
    { key: "detailsLabel", label: "Details section title" },
  ],
  grn: [
    { key: "deliveryInfoLabel", label: "Delivery information title" },
    { key: "supplierInfoLabel", label: "Supplier information title" },
    { key: "receivedByLabel", label: "Received by title" },
    { key: "receivedConditionLabel", label: "Received condition label" },
    { key: "commentsLabel", label: "Comments label" },
  ],
  transfer: [
    { key: "fromLabel", label: "From label" },
    { key: "toLabel", label: "To label" },
    { key: "qtyLabel", label: "Transfer quantity label" },
  ],
};

function defaultTemplate(kind: DocumentKind): DynamicDocumentTemplate {
  const base =
    kind === "po"
      ? {
          title: "PURCHASE ORDER",
          defaultTerms: "As per agreed prices, delivery and payment terms.",
          signLabelPrimary: "Authorized Signatory",
          signLabelSecondary: "Prepared By",
        }
      : kind === "pr"
        ? {
            title: "Purchase Requisition Format",
            defaultTerms: "As per internal procurement policy.",
            signLabelPrimary: "Requested By (Signature)",
            signLabelSecondary: "Approved By (Signature)",
          }
        : kind === "grn"
          ? {
              title: "GOODS RECEIVED NOTE",
              defaultTerms: "Check quantity and condition before inward.",
              signLabelPrimary: "Store/HO Receiving Sign",
              signLabelSecondary: "Authorized Signatory",
            }
          : {
              title: "SPARE TRANSFER NOTE",
              defaultTerms: "Transfer against approved PR.",
              signLabelPrimary: "HO Dispatch Sign",
              signLabelSecondary: "Store Inward Sign",
            };
  const labels: Record<string, string> = {};
  for (const ref of FIELD_REFS[kind]) labels[ref.key] = ref.label.replace(" label", "");
  return {
    id: createId(`tpl_${kind}`),
    kind,
    name: `${kind.toUpperCase()} Default`,
    title: base.title,
    titleAlign: "center",
    defaultTerms: base.defaultTerms,
    signLabelPrimary: base.signLabelPrimary,
    signLabelSecondary: base.signLabelSecondary,
    labels,
  };
}

export const DEFAULT_DOCUMENT_TEMPLATE_STORE: DocumentTemplateStore = {
  branding: DEFAULT_DOCUMENT_BRANDING,
  templatesByKind: {
    po: [defaultTemplate("po")],
    pr: [defaultTemplate("pr")],
    grn: [defaultTemplate("grn")],
    transfer: [defaultTemplate("transfer")],
  },
  activeTemplateIdByKind: {
    po: "",
    pr: "",
    grn: "",
    transfer: "",
  },
};
DEFAULT_DOCUMENT_TEMPLATE_STORE.activeTemplateIdByKind.po = DEFAULT_DOCUMENT_TEMPLATE_STORE.templatesByKind.po[0]!.id;
DEFAULT_DOCUMENT_TEMPLATE_STORE.activeTemplateIdByKind.pr = DEFAULT_DOCUMENT_TEMPLATE_STORE.templatesByKind.pr[0]!.id;
DEFAULT_DOCUMENT_TEMPLATE_STORE.activeTemplateIdByKind.grn = DEFAULT_DOCUMENT_TEMPLATE_STORE.templatesByKind.grn[0]!.id;
DEFAULT_DOCUMENT_TEMPLATE_STORE.activeTemplateIdByKind.transfer = DEFAULT_DOCUMENT_TEMPLATE_STORE.templatesByKind.transfer[0]!.id;

function normalizeStore(parsed: Partial<DocumentTemplateStore> | null | undefined): DocumentTemplateStore {
  const fallback = DEFAULT_DOCUMENT_TEMPLATE_STORE;
  const branding = parsed?.branding;
  const next: DocumentTemplateStore = {
    branding: {
      companyName: branding?.companyName?.trim() || fallback.branding.companyName,
      companySlogan: branding?.companySlogan?.trim() || fallback.branding.companySlogan,
      companyAddress: branding?.companyAddress?.trim() || fallback.branding.companyAddress,
      companyCityStateZip: branding?.companyCityStateZip?.trim() || fallback.branding.companyCityStateZip,
      companyPhone: branding?.companyPhone?.trim() || fallback.branding.companyPhone,
      companyEmail: branding?.companyEmail?.trim() || fallback.branding.companyEmail,
    },
    templatesByKind: {
      po: parsed?.templatesByKind?.po?.length ? parsed.templatesByKind.po : fallback.templatesByKind.po,
      pr: parsed?.templatesByKind?.pr?.length ? parsed.templatesByKind.pr : fallback.templatesByKind.pr,
      grn: parsed?.templatesByKind?.grn?.length ? parsed.templatesByKind.grn : fallback.templatesByKind.grn,
      transfer: parsed?.templatesByKind?.transfer?.length ? parsed.templatesByKind.transfer : fallback.templatesByKind.transfer,
    },
    activeTemplateIdByKind: {
      po: parsed?.activeTemplateIdByKind?.po || "",
      pr: parsed?.activeTemplateIdByKind?.pr || "",
      grn: parsed?.activeTemplateIdByKind?.grn || "",
      transfer: parsed?.activeTemplateIdByKind?.transfer || "",
    },
  };
  (["po", "pr", "grn", "transfer"] as DocumentKind[]).forEach((kind) => {
    const exists = next.templatesByKind[kind].some((t) => t.id === next.activeTemplateIdByKind[kind]);
    if (!exists) next.activeTemplateIdByKind[kind] = next.templatesByKind[kind][0]!.id;
  });
  return next;
}

export function loadDocumentTemplateStore(): DocumentTemplateStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeStore(undefined);
    const parsed = JSON.parse(raw) as Partial<DocumentTemplateStore>;
    return normalizeStore(parsed);
  } catch {
    return normalizeStore(undefined);
  }
}

export function saveDocumentTemplateStore(input: DocumentTemplateStore): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStore(input)));
}

export function listTemplateFieldReferences(kind: DocumentKind): FieldRef[] {
  return FIELD_REFS[kind];
}

export function createTemplateForKind(kind: DocumentKind, name?: string): DynamicDocumentTemplate {
  const t = defaultTemplate(kind);
  return { ...t, name: name?.trim() || `${kind.toUpperCase()} Template` };
}

export function getActiveTemplateByKind(store: DocumentTemplateStore, kind: DocumentKind): DynamicDocumentTemplate {
  return (
    store.templatesByKind[kind].find((t) => t.id === store.activeTemplateIdByKind[kind]) ??
    store.templatesByKind[kind][0] ??
    createTemplateForKind(kind)
  );
}

