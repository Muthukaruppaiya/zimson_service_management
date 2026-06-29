import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";

type BrandCreditNoteRow = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  status: string;
  brandInvoiceRef: string | null;
  brandInvoiceMeta: Record<string, unknown> | null;
  brandCouponCode: string | null;
  brandCouponValueInr: number | null;
  brandCouponValidUntil: string | null;
  brandCouponReceivedAt: string | null;
  brandCreditNoteApprovedAt: string | null;
  createdAt: string;
};

function attachmentUrl(meta: Record<string, unknown> | null | undefined): string | null {
  const path = String(meta?.attachmentPath ?? "").trim();
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return path.startsWith("/") ? path : `/uploads/${path}`;
}

function proposedAmountLabel(row: BrandCreditNoteRow): string {
  if (row.brandCouponValueInr != null && Number.isFinite(row.brandCouponValueInr)) {
    return formatInr(row.brandCouponValueInr);
  }
  return "—";
}

type EditableAmountProps = {
  jobId: string;
  proposedInr: number | null;
  value: string;
  editing: boolean;
  disabled: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChange: (value: string) => void;
};

function EditableVoucherAmount({
  jobId,
  proposedInr,
  value,
  editing,
  disabled,
  onStartEdit,
  onStopEdit,
  onChange,
}: EditableAmountProps) {
  const display = value.trim() || (proposedInr != null ? String(proposedInr) : "");

  if (editing) {
    return (
      <label className="block text-xs text-stone-600">
        Voucher amount (INR) *
        <input
          id={`voucher-amt-${jobId}`}
          type="number"
          min="0"
          step="0.01"
          autoFocus
          disabled={disabled}
          className="mt-1 w-full rounded-xl border border-emerald-400 bg-white px-3 py-2 text-sm font-semibold text-zimson-900 ring-2 ring-emerald-200"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onStopEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") onStopEdit();
          }}
        />
      </label>
    );
  }

  const numeric = Number(display);
  const formatted = Number.isFinite(numeric) && numeric > 0 ? formatInr(numeric) : "—";

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Voucher amount (supervisor proposed)</p>
      <button
        type="button"
        disabled={disabled}
        onDoubleClick={onStartEdit}
        title="Double-click to change amount"
        className="mt-1 w-full rounded-xl border border-zimson-200 bg-zimson-50/80 px-3 py-2.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60"
      >
        <span className="text-lg font-bold text-zimson-900">{formatted}</span>
        <span className="mt-0.5 block text-[11px] text-stone-500">Double-click to modify · otherwise approve as shown</span>
      </button>
    </div>
  );
}

export function BrandCreditNotesPage() {
  const { accountsApproveBrandCreditNote } = useSrfJobs();
  const [rows, setRows] = useState<BrandCreditNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [valueByJob, setValueByJob] = useState<Record<string, string>>({});
  const [validUntilByJob, setValidUntilByJob] = useState<Record<string, string>>({});
  const [noteByJob, setNoteByJob] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [amountEditingId, setAmountEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{ rows: BrandCreditNoteRow[] }>("/api/accounts/brand-credit-notes");
      setRows(out.rows);
      setValueByJob((prev) => {
        const next = { ...prev };
        for (const r of out.rows) {
          if (r.status === "brand_credit_note_pending" && r.brandCouponValueInr != null && !next[r.id]) {
            next[r.id] = String(r.brandCouponValueInr);
          }
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load brand credit notes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.reference.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        `${r.watchBrand} ${r.watchModel}`.toLowerCase().includes(q) ||
        (r.brandCouponCode ?? "").toLowerCase().includes(q) ||
        (r.brandInvoiceRef ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const pending = filtered.filter((r) => r.status === "brand_credit_note_pending");
  const approved = filtered.filter((r) => r.status === "closed" && r.brandCreditNoteApprovedAt);
  const selectedPending = pending.find((r) => r.id === selectedPendingId) ?? null;

  function resolveValueInr(job: BrandCreditNoteRow): number | null {
    const raw = (valueByJob[job.id] ?? "").trim() || (job.brandCouponValueInr != null ? String(job.brandCouponValueInr) : "");
    const valueInr = Number(raw);
    if (!Number.isFinite(valueInr) || valueInr <= 0) return null;
    return valueInr;
  }

  async function approve(job: BrandCreditNoteRow) {
    setBusyId(job.id);
    setFeedback((f) => ({ ...f, [job.id]: "" }));
    const valueInr = resolveValueInr(job);
    if (valueInr == null) {
      setFeedback((f) => ({ ...f, [job.id]: "Enter a valid voucher amount (INR)." }));
      setBusyId(null);
      return;
    }
    try {
      const out = await accountsApproveBrandCreditNote(job.id, {
        valueInr,
        validUntil: (validUntilByJob[job.id] ?? "").trim() || undefined,
        note: (noteByJob[job.id] ?? "").trim() || undefined,
      });
      const notifyParts = [
        `Voucher ${out.voucherCode} issued for ${formatInr(valueInr)}.`,
        "SRF closed — watch retained at brand (no return dispatch).",
        out.emailSent ? "Email sent." : "Email not sent (check customer email / SMTP).",
        out.whatsappSent ? "WhatsApp sent." : "",
      ].filter(Boolean);
      setFeedback((f) => ({ ...f, [job.id]: notifyParts.join(" ") }));
      if (selectedPendingId === job.id) setSelectedPendingId(null);
      setAmountEditingId(null);
      await load();
    } catch (e) {
      setFeedback((f) => ({ ...f, [job.id]: e instanceof Error ? e.message : "Could not approve." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Brand credit notes"
        description="Review supervisor-proposed voucher amounts, approve to issue a ZIM voucher code, and email the customer."
        actions={
          <Link
            to="/accounts/invoice-history"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Invoice history
          </Link>
        }
      />

      <div className="mb-4">
        <FilterField label="Search" htmlFor="brand-cn-q" className="ui-filter-span-2-sm">
          <input
            id="brand-cn-q"
            className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SRF, customer, phone, brand ref…"
          />
        </FilterField>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-600">Loading…</p>
      ) : (
        <div className="space-y-6">
          <Card title="Pending approval" subtitle="Click an SRF to review — approve as proposed or double-click amount to change">
            {pending.length === 0 ? (
              <p className="text-sm text-stone-600">No credit notes awaiting approval.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {pending.map((r) => {
                    const selected = selectedPendingId === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelectedPendingId(selected ? null : r.id);
                          setAmountEditingId(null);
                          if (!valueByJob[r.id] && r.brandCouponValueInr != null) {
                            setValueByJob((prev) => ({ ...prev, [r.id]: String(r.brandCouponValueInr) }));
                          }
                        }}
                        className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                          selected
                            ? "border-amber-400 bg-amber-50/90 ring-2 ring-amber-300"
                            : "border-amber-200/80 bg-white/90 hover:border-amber-300 hover:bg-amber-50/40"
                        }`}
                      >
                        <p className="font-mono text-sm font-bold text-zimson-900">{r.reference}</p>
                        <p className="mt-1 text-sm text-stone-800">{r.customerName}</p>
                        <p className="text-xs text-stone-600">{r.watchBrand} {r.watchModel}</p>
                        <p className="mt-2 text-sm font-semibold text-emerald-800">{proposedAmountLabel(r)}</p>
                        <p className="mt-1 text-[11px] text-stone-500">{selected ? "Selected — options below" : "Click to open approval"}</p>
                      </button>
                    );
                  })}
                </div>

                {selectedPending ? (
                  <div className="rounded-2xl border border-amber-300 bg-white p-5 shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-base font-bold text-zimson-900">{selectedPending.reference}</p>
                        <p className="text-sm text-stone-800">
                          {selectedPending.customerName} · {selectedPending.phone}
                        </p>
                        <p className="mt-1 text-sm text-stone-600">
                          {selectedPending.watchBrand} {selectedPending.watchModel} · {selectedPending.serial}
                        </p>
                        {selectedPending.brandInvoiceRef ? (
                          <p className="mt-2 text-xs text-stone-600">
                            Brand mail ref: <span className="font-mono font-semibold">{selectedPending.brandInvoiceRef}</span>
                          </p>
                        ) : null}
                      </div>
                      {attachmentUrl(selectedPending.brandInvoiceMeta) ? (
                        <a
                          href={attachmentUrl(selectedPending.brandInvoiceMeta)!}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                        >
                          View credit note document
                        </a>
                      ) : null}
                    </div>

                    <p className="mt-3 text-xs text-stone-500">
                      Voucher code is auto-generated (<span className="font-mono font-semibold">ZIM</span> + 8 alphanumeric) when you approve.
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <EditableVoucherAmount
                        jobId={selectedPending.id}
                        proposedInr={selectedPending.brandCouponValueInr}
                        value={valueByJob[selectedPending.id] ?? ""}
                        editing={amountEditingId === selectedPending.id}
                        disabled={busyId === selectedPending.id}
                        onStartEdit={() => setAmountEditingId(selectedPending.id)}
                        onStopEdit={() => setAmountEditingId(null)}
                        onChange={(v) => setValueByJob((prev) => ({ ...prev, [selectedPending.id]: v }))}
                      />
                      <label className="text-xs text-stone-600">
                        Valid until
                        <input
                          type="date"
                          disabled={busyId === selectedPending.id}
                          className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                          value={
                            validUntilByJob[selectedPending.id] ??
                            (selectedPending.brandCouponValidUntil ? selectedPending.brandCouponValidUntil.slice(0, 10) : "")
                          }
                          onChange={(e) => setValidUntilByJob((prev) => ({ ...prev, [selectedPending.id]: e.target.value }))}
                        />
                      </label>
                      <label className="text-xs text-stone-600 sm:col-span-2">
                        Approval note (optional)
                        <input
                          disabled={busyId === selectedPending.id}
                          className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                          value={noteByJob[selectedPending.id] ?? ""}
                          onChange={(e) => setNoteByJob((prev) => ({ ...prev, [selectedPending.id]: e.target.value }))}
                          placeholder="Accounts remark"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === selectedPending.id}
                        onClick={() => void approve(selectedPending)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        {busyId === selectedPending.id ? "Approving…" : "Approve, issue voucher & email customer"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === selectedPending.id}
                        onClick={() => {
                          setSelectedPendingId(null);
                          setAmountEditingId(null);
                        }}
                        className="rounded-xl border border-zimson-300 px-4 py-2 text-sm text-stone-700 hover:bg-zimson-50"
                      >
                        Close
                      </button>
                      {feedback[selectedPending.id] ? (
                        <p className="w-full text-xs text-stone-600">{feedback[selectedPending.id]}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-stone-500">Select an SRF above to approve its credit note.</p>
                )}
              </div>
            )}
          </Card>

          <Card title="Closed with voucher" subtitle="Voucher emailed to customer — SRF closed at HO (watch not returned from brand)">
            {approved.length === 0 ? (
              <p className="text-sm text-stone-600">No approved vouchers yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zimson-200 text-left text-xs uppercase tracking-wide text-stone-500">
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Watch</th>
                      <th className="px-3 py-2">Voucher (ZIM)</th>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map((r) => (
                      <tr key={r.id} className="border-b border-zimson-100">
                        <td className="px-3 py-2 font-mono font-semibold">{r.reference}</td>
                        <td className="px-3 py-2">{r.customerName}</td>
                        <td className="px-3 py-2">{r.watchBrand} {r.watchModel}</td>
                        <td className="px-3 py-2 font-mono tracking-wider">{r.brandCouponCode ?? "—"}</td>
                        <td className="px-3 py-2">{formatInr(r.brandCouponValueInr ?? 0)}</td>
                        <td className="px-3 py-2 text-xs text-stone-600">
                          {r.brandCreditNoteApprovedAt ? new Date(r.brandCreditNoteApprovedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
