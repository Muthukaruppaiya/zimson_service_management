import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";
import { customFieldTypeLabel, slugifyFieldKey } from "../../lib/customFields";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  type CustomFieldDefinition,
  type CustomFieldEntityKey,
  type CustomFieldType,
} from "../../types/customField";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

type Draft = {
  label: string;
  fieldType: CustomFieldType;
  optionsText: string;
  required: boolean;
  showInList: boolean;
  searchable: boolean;
  helpText: string;
};

const emptyDraft: Draft = {
  label: "",
  fieldType: "text",
  optionsText: "",
  required: false,
  showInList: false,
  searchable: false,
  helpText: "",
};

export function CustomFieldsSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "super_admin" || user?.role === "admin";
  const [entity, setEntity] = useState<CustomFieldEntityKey>("customer");
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entityMeta = useMemo(() => CUSTOM_FIELD_ENTITIES.find((e) => e.key === entity), [entity]);

  async function load() {
    const data = await apiJson<{ fields: CustomFieldDefinition[] }>(
      `/api/custom-fields?entity=${encodeURIComponent(entity)}&all=1`,
    );
    setFields(data.fields ?? []);
  }

  useEffect(() => {
    setErr(null);
    setOk(null);
    void load().catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load fields."));
  }, [entity]);

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setErr(null);
    setOk(null);
    if (!draft.label.trim()) {
      setErr("Enter a field label.");
      return;
    }
    setBusy(true);
    try {
      await apiJson("/api/custom-fields", {
        method: "POST",
        json: {
          entityKey: entity,
          label: draft.label.trim(),
          fieldKey: slugifyFieldKey(draft.label),
          fieldType: draft.fieldType,
          optionsText: draft.optionsText,
          required: draft.required,
          showInList: draft.showInList,
          searchable: draft.searchable,
          helpText: draft.helpText.trim(),
        },
      });
      setDraft(emptyDraft);
      setOk("Field added. It will appear on the form and can be used for search / list if enabled.");
      await load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not add field.");
    } finally {
      setBusy(false);
    }
  }

  async function patchField(id: string, body: Record<string, unknown>) {
    setErr(null);
    setOk(null);
    try {
      await apiJson(`/api/custom-fields/${encodeURIComponent(id)}`, { method: "PATCH", json: body });
      await load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not update field.");
    }
  }

  async function removeField(id: string) {
    if (!confirm("Remove this custom field? Existing saved values stay on records but the field will no longer show.")) return;
    try {
      await apiJson(`/api/custom-fields/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not delete field.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Custom fields"
        description="Add any number of extra fields on Customer, Supplier, Inventory spare, or SRF. Required, list, and search flags make them functional — not just labels."
      />
      {err ? <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}
      {ok ? <div className="mb-4 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div> : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {CUSTOM_FIELD_ENTITIES.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => setEntity(e.key)}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest ${
              entity === e.key ? "bg-rlx-green text-white" : "border border-rlx-rule bg-white text-stone-600"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-stone-500">{entityMeta?.description}. Add as many fields as needed.</p>

      {canEdit ? (
        <Card title="Add a field">
          <form onSubmit={(e) => void addField(e)} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Label
              <input className={inputClass} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="e.g. Warranty card no." />
            </label>
            <label className="text-sm">
              Type
              <select
                className={inputClass}
                value={draft.fieldType}
                onChange={(e) => setDraft((d) => ({ ...d, fieldType: e.target.value as CustomFieldType }))}
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {customFieldTypeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            {draft.fieldType === "dropdown" ? (
              <label className="sm:col-span-2 text-sm">
                Dropdown options (one per line)
                <textarea
                  className={inputClass}
                  rows={3}
                  value={draft.optionsText}
                  onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))}
                  placeholder={"Option A\nOption B"}
                />
              </label>
            ) : null}
            <label className="sm:col-span-2 text-sm">
              Help text
              <input className={inputClass} value={draft.helpText} onChange={(e) => setDraft((d) => ({ ...d, helpText: e.target.value }))} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.required} onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))} />
              Required (blocks save if empty)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.showInList} onChange={(e) => setDraft((d) => ({ ...d, showInList: e.target.checked }))} />
              Show as list column
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.searchable} onChange={(e) => setDraft((d) => ({ ...d, searchable: e.target.checked }))} />
              Include in search
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Adding…" : "+ Add field"}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="mb-4 text-sm text-stone-500">Only Admin can add or change field definitions. You can still fill values on the forms.</p>
      )}

      <div className="mt-5 border border-rlx-rule bg-white">
        <div className="border-b border-rlx-rule bg-stone-50 px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-stone-400">
          {fields.length} field{fields.length === 1 ? "" : "s"} on {entityMeta?.label}
        </div>
        {fields.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-stone-400">No custom fields yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-rlx-rule">
            {fields.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-stone-800">
                    {f.label} {!f.isActive ? <span className="text-xs font-normal text-stone-400">(inactive)</span> : null}
                  </p>
                  <p className="font-mono text-[11px] text-stone-400">
                    {f.fieldKey} · {customFieldTypeLabel(f.fieldType)}
                    {f.required ? " · required" : ""}
                    {f.showInList ? " · list" : ""}
                    {f.searchable ? " · search" : ""}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="border border-rlx-rule px-2 py-1 text-[11px]" onClick={() => void patchField(f.id, { required: !f.required })}>
                      {f.required ? "Optional" : "Required"}
                    </button>
                    <button type="button" className="border border-rlx-rule px-2 py-1 text-[11px]" onClick={() => void patchField(f.id, { showInList: !f.showInList })}>
                      {f.showInList ? "Hide column" : "List column"}
                    </button>
                    <button type="button" className="border border-rlx-rule px-2 py-1 text-[11px]" onClick={() => void patchField(f.id, { searchable: !f.searchable })}>
                      {f.searchable ? "Not searchable" : "Searchable"}
                    </button>
                    <button type="button" className="border border-rlx-rule px-2 py-1 text-[11px]" onClick={() => void patchField(f.id, { isActive: !f.isActive })}>
                      {f.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" className="border border-red-200 px-2 py-1 text-[11px] text-red-700" onClick={() => void removeField(f.id)}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
