import { useState } from "react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  createTemplateForKind,
  getActiveTemplateByKind,
  listTemplateFieldReferences,
  loadDocumentTemplateStore,
  saveDocumentTemplateStore,
} from "../../lib/documentTemplates";
import type { DocumentKind } from "../../types/documentTemplate";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

export function DocumentTemplatesPage() {
  const [activeDoc, setActiveDoc] = useState<DocumentKind>("po");
  const [store, setStore] = useState(loadDocumentTemplateStore());
  const [msg, setMsg] = useState<string | null>(null);

  const activeTemplate = getActiveTemplateByKind(store, activeDoc);
  const docTemplates = store.templatesByKind[activeDoc];
  const refs = listTemplateFieldReferences(activeDoc);

  function updateBranding<K extends keyof typeof store.branding>(key: K, value: (typeof store.branding)[K]) {
    setStore((prev) => ({ ...prev, branding: { ...prev.branding, [key]: value } }));
    setMsg(null);
  }

  function updateTemplateField(patch: Partial<typeof activeTemplate>) {
    setStore((prev) => ({
      ...prev,
      templatesByKind: {
        ...prev.templatesByKind,
        [activeDoc]: prev.templatesByKind[activeDoc].map((t) =>
          t.id === activeTemplate.id ? { ...t, ...patch } : t,
        ),
      },
    }));
    setMsg(null);
  }

  function updateLabel(labelKey: string, value: string) {
    updateTemplateField({ labels: { ...activeTemplate.labels, [labelKey]: value } });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    saveDocumentTemplateStore(store);
    setMsg("Template store saved. New and existing document previews will use it.");
  }

  function addTemplate() {
    const newTpl = createTemplateForKind(activeDoc, `${activeDoc.toUpperCase()} Template ${docTemplates.length + 1}`);
    setStore((prev) => ({
      ...prev,
      templatesByKind: { ...prev.templatesByKind, [activeDoc]: [...prev.templatesByKind[activeDoc], newTpl] },
      activeTemplateIdByKind: { ...prev.activeTemplateIdByKind, [activeDoc]: newTpl.id },
    }));
    setMsg(null);
  }

  function deleteTemplate() {
    if (docTemplates.length <= 1) {
      setMsg("At least one template must remain per document type.");
      return;
    }
    const next = docTemplates.filter((t) => t.id !== activeTemplate.id);
    setStore((prev) => ({
      ...prev,
      templatesByKind: { ...prev.templatesByKind, [activeDoc]: next },
      activeTemplateIdByKind: { ...prev.activeTemplateIdByKind, [activeDoc]: next[0]!.id },
    }));
    setMsg(null);
  }

  return (
    <div>
      <PageHeader
        title="Document templates"
        description="Select document type, create/edit templates, and fully control design wording, alignment, and labels."
      />
      {msg ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      <Card title="Company branding" subtitle="Applied globally to all document templates">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-stone-600">Company name</label>
            <input className={inputClass} value={store.branding.companyName} onChange={(e) => updateBranding("companyName", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Slogan</label>
            <input className={inputClass} value={store.branding.companySlogan} onChange={(e) => updateBranding("companySlogan", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Address line</label>
            <input className={inputClass} value={store.branding.companyAddress} onChange={(e) => updateBranding("companyAddress", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">City / State / PIN</label>
            <input className={inputClass} value={store.branding.companyCityStateZip} onChange={(e) => updateBranding("companyCityStateZip", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Phone</label>
            <input className={inputClass} value={store.branding.companyPhone} onChange={(e) => updateBranding("companyPhone", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Email</label>
            <input className={inputClass} value={store.branding.companyEmail} onChange={(e) => updateBranding("companyEmail", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="mt-5" title="Per-document template manager" subtitle="Create new template or edit existing template by document type">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["po", "pr", "grn", "transfer"] as DocumentKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActiveDoc(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                activeDoc === k ? "bg-zimson-700 text-white" : "border border-stone-300 bg-white text-stone-700"
              }`}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-stone-600">Select template</label>
              <select
                className={inputClass}
                value={activeTemplate.id}
                onChange={(e) =>
                  setStore((prev) => ({
                    ...prev,
                    activeTemplateIdByKind: { ...prev.activeTemplateIdByKind, [activeDoc]: e.target.value },
                  }))
                }
              >
                {docTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="button" onClick={addTemplate} className="rounded-xl border border-zimson-400 bg-white px-4 py-2 text-sm font-semibold text-zimson-900">
                New template
              </button>
              <button type="button" onClick={deleteTemplate} className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700">
                Delete selected
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Template name</label>
              <input className={inputClass} value={activeTemplate.name} onChange={(e) => updateTemplateField({ name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Title</label>
              <input className={inputClass} value={activeTemplate.title} onChange={(e) => updateTemplateField({ title: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Title alignment</label>
              <select
                className={inputClass}
                value={activeTemplate.titleAlign}
                onChange={(e) => updateTemplateField({ titleAlign: e.target.value as "left" | "center" | "right" })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Default terms</label>
              <input className={inputClass} value={activeTemplate.defaultTerms} onChange={(e) => updateTemplateField({ defaultTerms: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Primary sign label</label>
              <input className={inputClass} value={activeTemplate.signLabelPrimary} onChange={(e) => updateTemplateField({ signLabelPrimary: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Secondary sign label</label>
              <input className={inputClass} value={activeTemplate.signLabelSecondary} onChange={(e) => updateTemplateField({ signLabelSecondary: e.target.value })} />
            </div>
          </div>

          <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3">
            <p className="text-xs font-semibold text-stone-700">Field references for {activeDoc.toUpperCase()}</p>
            <p className="mt-1 text-xs text-stone-500">Use these keys to control wording in the selected document template.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {refs.map((ref) => (
                <div key={ref.key}>
                  <label className="text-xs font-medium text-stone-600">
                    {ref.label} (`{ref.key}`)
                  </label>
                  <input
                    className={inputClass}
                    value={activeTemplate.labels[ref.key] ?? ""}
                    onChange={(e) => updateLabel(ref.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">
              Save all template changes
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

