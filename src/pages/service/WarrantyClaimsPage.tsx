import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { ApiError, apiJson } from "../../lib/api";
import { publicMediaUrl } from "../../lib/mediaUrl";
import { formatWarrantyTillDisplay } from "../../lib/serviceWarranty";
import { SRF_DOCUMENT_ACCEPT, validateSrfDocumentFile } from "../../lib/srfCustomerPhotoUpload";
import { inputClass } from "../../lib/uiForm";
import type { CustomerRecord } from "../../types/customer";
import type { WarrantyClaimStatus, WarrantyPurchaseClaim } from "../../types/warrantyClaim";

type CustomerLookup =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "found"; phone: string; name: string; code: string | null }
  | { state: "new"; phone: string }
  | { state: "error"; phone: string };

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

const WARRANTY_PERIODS = [6, 12, 18, 24, 36, 60] as const;

function addMonthsYmd(ymd: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !months) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + months, d!)).toISOString().slice(0, 10);
}

export function claimStatusChip(status: WarrantyClaimStatus): string {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300";
  if (status === "REJECTED") return "bg-rose-100 text-rose-900 ring-1 ring-rose-300";
  return "bg-amber-100 text-amber-950 ring-1 ring-amber-300";
}

export function claimStatusLabel(status: WarrantyClaimStatus): string {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Pending review";
}

type FormState = {
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  purchaseInvoiceNumber: string;
  purchaseDate: string;
  purchasedFrom: string;
  purchaseAmountInr: string;
  warrantyMonths: string;
  remarks: string;
};

function emptyForm(phone = "", name = ""): FormState {
  return {
    customerName: name,
    phone,
    watchBrand: "",
    watchModel: "",
    serial: "",
    purchaseInvoiceNumber: "",
    purchaseDate: "",
    purchasedFrom: "",
    purchaseAmountInr: "",
    warrantyMonths: "12",
    remarks: "",
  };
}

export function WarrantyClaimsPage() {
  const { user } = useAuth();
  const { brands } = useBrands();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError, alertModal } = useMessageAlert();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(() =>
    emptyForm(
      (searchParams.get("phone") ?? "").replace(/\D/g, "").slice(-10),
      (searchParams.get("name") ?? "").trim(),
    ),
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<WarrantyPurchaseClaim[]>([]);
  const [filter, setFilter] = useState<"ALL" | WarrantyClaimStatus>("ALL");
  const [query, setQuery] = useState("");

  const [lookup, setLookup] = useState<CustomerLookup>({ state: "idle" });
  const autoFilledNameRef = useRef("");

  const today = new Date().toISOString().slice(0, 10);
  const tillPreview = addMonthsYmd(form.purchaseDate, Number(form.warrantyMonths));

  useEffect(() => {
    const p10 = form.phone.replace(/\D/g, "");
    if (p10.length !== 10) {
      const filled = autoFilledNameRef.current;
      if (filled) {
        autoFilledNameRef.current = "";
        setForm((f) => (f.customerName === filled ? { ...f, customerName: "" } : f));
      }
      setLookup({ state: "idle" });
      return;
    }
    let cancelled = false;
    setLookup({ state: "checking" });
    void apiJson<{ customer: CustomerRecord | null }>(`/api/customers?phone=${encodeURIComponent(p10)}`, { silent: true })
      .then((data) => {
        if (cancelled) return;
        const c = data.customer;
        if (c) {
          const name =
            (c.customerKind === "B2B" && c.company?.trim()) ||
            c.displayName?.trim() ||
            [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
          if (name) {
            autoFilledNameRef.current = name;
            setForm((f) => ({ ...f, customerName: name }));
          }
          setLookup({ state: "found", phone: p10, name, code: c.customerCode ?? null });
        } else {
          setLookup({ state: "new", phone: p10 });
        }
      })
      .catch(() => {
        if (!cancelled) setLookup({ state: "error", phone: p10 });
      });
    return () => {
      cancelled = true;
    };
  }, [form.phone]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ claims: WarrantyPurchaseClaim[] }>("/api/service/warranty-claims");
      setClaims(data.claims ?? []);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "Could not load warranty claims.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (filter !== "ALL" && c.status !== filter) return false;
      if (!q) return true;
      return [c.claimNumber, c.customerName, c.phone, c.purchaseInvoiceNumber, c.watchBrand, c.watchModel, c.serial]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [claims, filter, query]);

  function set(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      const err = validateSrfDocumentFile(f);
      if (err) {
        showError(err);
        e.target.value = "";
        return;
      }
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      showError("Upload the purchase invoice (PDF or image).");
      return;
    }
    if (form.phone.replace(/\D/g, "").length !== 10) {
      showError("Enter a valid 10-digit customer mobile.");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) fd.append(k, v);
      fd.append("file", file);
      const res = await fetch("/api/service/warranty-claims", { method: "POST", body: fd, credentials: "include" });
      const text = await res.text();
      let data: { claim?: WarrantyPurchaseClaim; error?: string } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        /* non-JSON */
      }
      if (!res.ok || !data.claim) throw new Error(data.error || "Could not submit warranty claim.");
      setClaims((prev) => [data.claim!, ...prev]);
      autoFilledNameRef.current = "";
      setForm(emptyForm());
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      showSuccess(`${data.claim.claimNumber} sent to back office for review.`, "Claim submitted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not submit warranty claim.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-4">
      <PageHeader title="Purchase warranty claims" description="" />
      {alertModal}

      <Card title="New claim — watch purchased (not billed in this system)">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <span className={labelClass}>Customer mobile *</span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              required
            />
            {lookup.state === "checking" ? (
              <span className="mt-1 block text-xs text-stone-500">Checking customer…</span>
            ) : lookup.state === "found" ? (
              <span className="mt-1 block text-xs font-semibold text-emerald-700">
                Existing customer{lookup.code ? ` · ${lookup.code}` : ""}
              </span>
            ) : lookup.state === "new" ? (
              <span className="mt-1 block text-xs font-medium text-amber-700">New customer — enter the name</span>
            ) : lookup.state === "error" ? (
              <span className="mt-1 block text-xs text-rose-700">Could not check customer — enter the name</span>
            ) : null}
          </label>
          <label className="text-sm">
            <span className={labelClass}>Customer name *</span>
            <input
              className={inputClass}
              value={form.customerName}
              onChange={(e) => set({ customerName: e.target.value })}
              readOnly={lookup.state === "found" && Boolean(lookup.name)}
              required
            />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Brand *</span>
            <select
              className={inputClass}
              value={form.watchBrand}
              onChange={(e) => set({ watchBrand: e.target.value })}
              required
            >
              <option value="">Select brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClass}>Model *</span>
            <input className={inputClass} value={form.watchModel} onChange={(e) => set({ watchModel: e.target.value })} required />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Serial number</span>
            <input className={inputClass} value={form.serial} onChange={(e) => set({ serial: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Purchased from (store / dealer) *</span>
            <input
              className={inputClass}
              value={form.purchasedFrom}
              onChange={(e) => set({ purchasedFrom: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Purchase invoice number *</span>
            <input
              className={inputClass}
              value={form.purchaseInvoiceNumber}
              onChange={(e) => set({ purchaseInvoiceNumber: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Purchase date *</span>
            <input
              type="date"
              className={inputClass}
              max={today}
              value={form.purchaseDate}
              onChange={(e) => set({ purchaseDate: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Invoice amount (₹)</span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={form.purchaseAmountInr}
              onChange={(e) => set({ purchaseAmountInr: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </label>
          <label className="text-sm">
            <span className={labelClass}>Warranty period *</span>
            <select
              className={inputClass}
              value={form.warrantyMonths}
              onChange={(e) => set({ warrantyMonths: e.target.value })}
            >
              {WARRANTY_PERIODS.map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <span className={labelClass}>Warranty till</span>
            <p className="mt-1 flex h-[42px] items-center border border-rlx-rule bg-stone-50 px-3 font-mono text-sm text-stone-800">
              {tillPreview ? formatWarrantyTillDisplay(tillPreview) : "—"}
              {tillPreview && tillPreview < today ? (
                <span className="ml-2 font-sans text-xs font-semibold text-rose-700">Expired</span>
              ) : null}
            </p>
          </div>
          <label className="text-sm">
            <span className={labelClass}>Purchase invoice (PDF / image) *</span>
            <input
              ref={fileRef}
              type="file"
              accept={SRF_DOCUMENT_ACCEPT}
              onChange={onFilePick}
              className="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:border-0 file:bg-rlx-green file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              required
            />
          </label>
          <label className="text-sm md:col-span-3">
            <span className={labelClass}>Remarks</span>
            <textarea
              className={inputClass}
              rows={2}
              value={form.remarks}
              onChange={(e) => set({ remarks: e.target.value })}
            />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green-deep disabled:opacity-60"
            >
              {saving ? "Submitting…" : "Submit for back-office approval"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Submitted claims">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold ${
                filter === s ? "bg-rlx-green text-white" : "border border-rlx-rule bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              {s === "ALL" ? "All" : claimStatusLabel(s)}
            </button>
          ))}
          <input
            className={`${inputClass} ml-auto !mt-0 max-w-xs`}
            placeholder="Search claim / invoice / mobile…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">No claims.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zimson-50/80 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Claim</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Watch</th>
                  <th className="px-3 py-2">Purchase invoice</th>
                  <th className="px-3 py-2">Warranty till</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t border-zimson-100 align-top">
                    <td className="px-3 py-2">
                      <p className="font-mono font-semibold text-zimson-900">{c.claimNumber}</p>
                      <p className="text-xs text-stone-500">{new Date(c.submittedAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-stone-900">{c.customerName}</p>
                      <p className="font-mono text-xs text-stone-500">{c.phone}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p>
                        {c.watchBrand} {c.watchModel}
                      </p>
                      {c.serial ? <p className="font-mono text-xs text-stone-500">S/N {c.serial}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={publicMediaUrl(c.invoiceFilePath)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-semibold text-rlx-green underline underline-offset-2"
                      >
                        {c.purchaseInvoiceNumber}
                      </a>
                      <p className="text-xs text-stone-500">
                        {formatWarrantyTillDisplay(c.purchaseDate)} · {c.purchasedFrom}
                      </p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatWarrantyTillDisplay(c.warrantyTillDate)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 text-[11px] font-bold ${claimStatusChip(c.status)}`}>
                        {claimStatusLabel(c.status)}
                      </span>
                      {c.status === "REJECTED" && c.reviewNote ? (
                        <p className="mt-1 max-w-[16rem] text-xs text-rose-800">{c.reviewNote}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
