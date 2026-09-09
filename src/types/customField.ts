export const CUSTOM_FIELD_ENTITY_KEYS = ["customer", "supplier", "spare", "srf"] as const;
export type CustomFieldEntityKey = (typeof CUSTOM_FIELD_ENTITY_KEYS)[number];

export const CUSTOM_FIELD_ENTITIES: Array<{ key: CustomFieldEntityKey; label: string; description: string }> = [
  { key: "customer", label: "Customer", description: "Customer register and master" },
  { key: "supplier", label: "Supplier", description: "Supplier master" },
  { key: "spare", label: "Inventory spare", description: "Spare catalogue" },
  { key: "srf", label: "SRF", description: "Service request booking" },
];

export const CUSTOM_FIELD_TYPES = ["text", "textarea", "number", "date", "dropdown", "checkbox", "phone", "email"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldValue = string | number | boolean | null;
export type CustomFieldValues = Record<string, CustomFieldValue>;

export type CustomFieldDefinition = {
  id: string;
  entityKey: CustomFieldEntityKey;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  showInList: boolean;
  searchable: boolean;
  helpText: string;
  sortOrder: number;
  isActive: boolean;
};
