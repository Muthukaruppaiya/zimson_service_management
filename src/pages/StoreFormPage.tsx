import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { useRegions, type StoreUpsertPayload } from "../context/RegionsContext";
import { ApiError } from "../lib/api";
import {
  sanitizeAddressInput,
  sanitizeAlphanumericInput,
  sanitizeEmailInput,
  sanitizeGstPanInput,
  sanitizePhoneDigits,
  sanitizeTextInput,
} from "../lib/inputSanitize";
import { draftToStorePatch, emptyStoreDraft, seedStoreToDraft, type StoreFormDraft } from "./RegionsPage";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-rlx-green focus:ring-2 focus:ring-rlx-green/20";

function Field({
  label,
  required,
  hint,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-stone-400">{hint}</span> : null}
    </label>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-rlx-rule bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-rlx-rule bg-rlx-bg/60 px-5 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rlx-green text-[11px] font-bold text-white">
          {step}
        </span>
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-rlx-green">{title}</h2>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function StoreFormPage() {
  const { regionId = "", storeId } = useParams<{ regionId: string; storeId?: string }>();
  const isEdit = Boolean(storeId);
  const { user } = useAuth();
  const { regions, addStore, patchStore } = useRegions();
  const { success } = useToast();
  const navigate = useNavigate();

  const region = useMemo(() => regions.find((r) => r.id === regionId) ?? null, [regions, regionId]);
  const store = useMemo(
    () => (storeId ? region?.stores.find((s) => s.id === storeId) ?? null : null),
    [region, storeId],
  );

  const [draft, setDraft] = useState<StoreFormDraft>(() => (store ? seedStoreToDraft(store) : emptyStoreDraft()));
  const [loadedStoreId, setLoadedStoreId] = useState<string | null>(store?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (store && loadedStoreId !== store.id) {
      setDraft(seedStoreToDraft(store));
      setLoadedStoreId(store.id);
    }
  }, [store, loadedStoreId]);

  const canManage = Boolean(
    user && (user.role === "super_admin" || (user.role === "admin" && user.regionId === regionId)),
  );
  const backTo = `/regions?region=${encodeURIComponent(regionId)}`;

  if (user && !canManage) return <Navigate to="/regions" replace />;

  const set = (patch: Partial<StoreFormDraft>) => setDraft((p) => ({ ...p, ...patch }));

  async function handleSave() {
    const name = draft.name.trim();
    if (!name) {
      setErr("Store name is required.");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      if (isEdit && storeId) {
        await patchStore(storeId, draftToStorePatch(draft));
        success("Store updated", `"${name}" details have been saved.`);
      } else {
        await addStore(regionId, draftToStorePatch(draft) as StoreUpsertPayload);
        success("Store added", `"${name}" has been added successfully.`);
      }
      navigate(backTo);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : isEdit ? "Could not save store." : "Could not create store.");
    } finally {
      setSaving(false);
    }
  }

  const notFound = regions.length > 0 && (!region || (isEdit && !store));
  const regionAddress = region?.address?.trim() ?? "";
  const previewAddress = draft.invoiceAddress.trim() || regionAddress;
  const previewGstin = draft.invoiceGstin.trim() || region?.gst || "";
  const termsLines = draft.invoiceTerms
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div>
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
        <Link to="/regions" className="font-semibold text-rlx-green hover:underline">
          Regions &amp; Stores
        </Link>
        {region ? (
          <>
            <span>/</span>
            <Link to={backTo} className="font-semibold text-rlx-green hover:underline">
              {region.name}
            </Link>
          </>
        ) : null}
        <span>/</span>
        <span>{isEdit ? "Edit store" : "New store"}</span>
      </nav>

      <div className="mb-5 overflow-hidden rounded-xl border border-rlx-rule bg-gradient-to-r from-rlx-green-deep to-rlx-green text-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-rlx-gold-dark via-rlx-gold to-rlx-gold-light" />
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-rlx-gold-light">
              {isEdit ? "Edit store" : "New store"}
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold">
              {draft.name.trim() || store?.name || "Untitled store"}
            </h1>
            {region ? (
              <p className="mt-1 text-sm text-white/70">
                {region.name}
                {region.regionCode ? ` · ${region.regionCode}` : ""}
                {region.gst ? ` · GST ${region.gst}` : ""}
              </p>
            ) : null}
          </div>
          <Link
            to={backTo}
            className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white no-underline transition hover:bg-white/20"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to region
          </Link>
        </div>
      </div>

      {notFound ? (
        <div className="rounded-xl border border-dashed border-rlx-rule bg-white px-5 py-12 text-center text-sm text-stone-500">
          {region ? "Store not found in this region." : "Region not found."}
        </div>
      ) : (
        <form
          id="store-form"
          className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div className="space-y-5">
            <Section step={1} title="Store identity">
              <Field label="Store code / name" required>
                <input
                  className={fieldClass}
                  value={draft.name}
                  onChange={(e) => set({ name: sanitizeTextInput(e.target.value, 240) })}
                  placeholder="e.g. CHN01"
                  autoFocus={!isEdit}
                />
              </Field>
              <Field label="Invoice store code" hint="Used in SRF, transfer (TD) and invoice numbers">
                <input
                  className={`${fieldClass} font-mono uppercase`}
                  value={draft.invoiceNumberStoreCode}
                  onChange={(e) => set({ invoiceNumberStoreCode: sanitizeAlphanumericInput(e.target.value, 16).toUpperCase() })}
                  placeholder="e.g. CBE01"
                />
              </Field>
            </Section>

            <Section step={2} title="Printed invoice">
              <Field label="Store name (invoice)" className="sm:col-span-2">
                <input
                  className={fieldClass}
                  value={draft.invoiceDisplayName}
                  onChange={(e) => set({ invoiceDisplayName: sanitizeTextInput(e.target.value, 280) })}
                  placeholder="e.g. ZIMSON - THE WATCH STORE"
                />
              </Field>
              <Field label="Tagline">
                <input
                  className={fieldClass}
                  value={draft.invoiceTagline}
                  onChange={(e) => set({ invoiceTagline: sanitizeTextInput(e.target.value, 160) })}
                  placeholder="e.g. THE WATCH STORE SINCE 1948"
                />
              </Field>
              <Field label="Legal entity (“For …” footer)">
                <input
                  className={fieldClass}
                  value={draft.invoiceLegalEntityName}
                  onChange={(e) => set({ invoiceLegalEntityName: sanitizeTextInput(e.target.value, 280) })}
                  placeholder="e.g. ZIMSON TIMES PVT LTD"
                />
              </Field>
            </Section>

            <Section step={3} title="Address & contact">
              <Field
                label="Store address"
                className="sm:col-span-2"
                hint={regionAddress ? `Leave blank to use the region address: ${regionAddress}` : undefined}
              >
                <textarea
                  className={`${fieldClass} min-h-[96px] resize-y`}
                  rows={3}
                  value={draft.invoiceAddress}
                  onChange={(e) => set({ invoiceAddress: sanitizeAddressInput(e.target.value, 500) })}
                  placeholder={"Street, area\nCity, State - PIN"}
                />
              </Field>
              <Field label="Phone">
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={draft.invoicePhone}
                  onChange={(e) => set({ invoicePhone: sanitizePhoneDigits(e.target.value, 15) })}
                  placeholder="10-digit mobile / landline"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={fieldClass}
                  value={draft.invoiceEmail}
                  onChange={(e) => set({ invoiceEmail: sanitizeEmailInput(e.target.value) })}
                  placeholder="store@zimson.com"
                />
              </Field>
              <Field
                label="Store GSTIN (override)"
                hint={region?.gst ? `Region GSTIN ${region.gst} is used when blank` : undefined}
              >
                <input
                  className={`${fieldClass} font-mono uppercase`}
                  value={draft.invoiceGstin}
                  onChange={(e) => set({ invoiceGstin: sanitizeGstPanInput(e.target.value, 15) })}
                  placeholder="15-character GSTIN"
                />
              </Field>
            </Section>

            <Section step={4} title="Terms & conditions">
              <Field label="One point per line" className="sm:col-span-2">
                <textarea
                  className={`${fieldClass} min-h-[120px] resize-y`}
                  rows={5}
                  value={draft.invoiceTerms}
                  onChange={(e) => set({ invoiceTerms: sanitizeTextInput(e.target.value, 500) })}
                  placeholder="Numbered automatically on print"
                />
              </Field>
            </Section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <div className="overflow-hidden rounded-xl border border-rlx-rule bg-white shadow-sm">
              <div className="border-b border-rlx-rule bg-rlx-bg/60 px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">Invoice header preview</p>
              </div>
              <div className="space-y-2 p-4">
                <p className="text-sm font-bold uppercase leading-snug text-stone-900">
                  {draft.invoiceDisplayName.trim() || draft.name.trim() || "Store name"}
                </p>
                {draft.invoiceTagline.trim() ? (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rlx-gold-dark">{draft.invoiceTagline.trim()}</p>
                ) : null}
                <p className="whitespace-pre-line text-xs leading-relaxed text-stone-600">{previewAddress || "—"}</p>
                <div className="space-y-0.5 border-t border-rlx-rule pt-2 text-xs text-stone-600">
                  <p>
                    <span className="font-semibold text-stone-500">Ph:</span> {draft.invoicePhone.trim() || region?.phone || "—"}
                  </p>
                  <p>
                    <span className="font-semibold text-stone-500">Email:</span> {draft.invoiceEmail.trim() || region?.email || "—"}
                  </p>
                  <p>
                    <span className="font-semibold text-stone-500">GSTIN:</span>{" "}
                    <span className="font-mono">{previewGstin || "—"}</span>
                  </p>
                </div>
                {draft.invoiceNumberStoreCode.trim() ? (
                  <p className="pt-1">
                    <span className="rounded border border-rlx-gold/60 bg-rlx-gold/10 px-2 py-0.5 font-mono text-[11px] font-bold text-rlx-green">
                      {draft.invoiceNumberStoreCode.trim()}
                    </span>
                  </p>
                ) : null}
                {termsLines.length > 0 ? (
                  <ol className="list-decimal space-y-0.5 border-t border-rlx-rule pl-4 pt-2 text-[11px] text-stone-500">
                    {termsLines.slice(0, 4).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                    {termsLines.length > 4 ? <li className="list-none text-stone-400">+{termsLines.length - 4} more</li> : null}
                  </ol>
                ) : null}
                {draft.invoiceLegalEntityName.trim() ? (
                  <p className="border-t border-rlx-rule pt-2 text-right text-[11px] font-semibold text-stone-700">
                    For {draft.invoiceLegalEntityName.trim()}
                  </p>
                ) : null}
              </div>
            </div>

            {region ? (
              <div className="rounded-xl border border-rlx-rule bg-white p-4 text-xs text-stone-600 shadow-sm">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">Region / CSC</p>
                <p className="font-semibold text-stone-800">{region.name}</p>
                {region.gst ? <p className="mt-1">GST <span className="font-mono">{region.gst}</span></p> : null}
                {region.pan ? <p>PAN <span className="font-mono">{region.pan}</span></p> : null}
                <p className="mt-1">{region.stores.length} store(s) in this region</p>
              </div>
            ) : null}
          </aside>
        </form>
      )}

      {!notFound ? (
        <div className="sticky bottom-0 z-20 mt-5 rounded-xl border border-rlx-rule bg-white/95 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 md:px-5">
            {err ? (
              <p className="mr-auto rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">{err}</p>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => navigate(backTo)}
              className="rounded-lg border border-rlx-rule bg-white px-5 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="store-form"
              disabled={saving}
              className="rounded-lg bg-rlx-green px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save store" : "Create store"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
