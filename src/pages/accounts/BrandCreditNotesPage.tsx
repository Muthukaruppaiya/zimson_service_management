import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
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

function hasSupervisorProposedAmount(row: BrandCreditNoteRow): boolean {
  return row.brandCouponValueInr != null && Number.isFinite(row.brandCouponValueInr) && row.brandCouponValueInr > 0;
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
  const [valueByJob, setValueByJob] = useState<Record<string, string>>({});
  const [validUntilByJob, setValidUntilByJob] = useState<Record<string, string>>({});
  const [noteByJob, setNoteByJob] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [amountEditingId, setAmountEditingId] = useState<string | null>(null);
  const [approvalSuccess, setApprovalSuccess] = useState<{
    reference: string;
    voucherCode: string;
    valueInr: number;
    emailSent: boolean;
    whatsappSent: boolean;
  } | null>(null);
  const { showError, alertModal } = useMessageAlert();

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

  const pending = filtered.filter(
    (r) => r.status === "brand_credit_note_pending" && hasSupervisorProposedAmount(r),
  );
  const approved = filtered.filter((r) => r.status === "closed" && r.brandCreditNoteApprovedAt);
  const selectedPending = pending.find((r) => r.id === selectedPendingId) ?? null;

  useEffect(() => {
    if (selectedPendingId && !pending.some((r) => r.id === selectedPendingId)) {
      setSelectedPendingId(null);
      setAmountEditingId(null);
    }
  }, [pending, selectedPendingId]);

  function resolveValueInr(job: BrandCreditNoteRow): number | null {
    const raw = (valueByJob[job.id] ?? "").trim() || (job.brandCouponValueInr != null ? String(job.brandCouponValueInr) : "");
    const valueInr = Number(raw);
    if (!Number.isFinite(valueInr) || valueInr <= 0) return null;
    return valueInr;
  }

  async function approve(job: BrandCreditNoteRow) {
    setBusyId(job.id);
    const valueInr = resolveValueInr(job);
    if (valueInr == null) {
      showError("Enter a valid voucher amount (INR).", "Cannot approve");
      setBusyId(null);
      return;
    }
    try {
      const out = await accountsApproveBrandCreditNote(job.id, {
        valueInr,
        validUntil: (validUntilByJob[job.id] ?? "").trim() || undefined,
        note: (noteByJob[job.id] ?? "").trim() || undefined,
      });
      setSelectedPendingId(null);
      setAmountEditingId(null);
      setApprovalSuccess({
        reference: job.reference,
        voucherCode: out.voucherCode,
        valueInr,
        emailSent: out.emailSent,
        whatsappSent: out.whatsappSent,
      });
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not approve.", "Approval failed");
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
          <div className="flex flex-wrap gap-2">
            <Link
              to="/accounts/brand-credit-history"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Credit note history
            </Link>
            <Link
              to="/accounts/invoice-history"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Invoice history
            </Link>
          </div>
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
          <Card title="Pending approval">
            {pending.length === 0 ? (
              <p className="text-sm text-stone-600">
                No credit notes ready for approval. Supervisor must log voucher amount from brand mail first.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="divide-y divide-amber-100 overflow-hidden rounded-xl border border-amber-200">
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
                        className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition ${
                          selected ? "bg-amber-50 ring-2 ring-inset ring-amber-400" : "bg-white hover:bg-amber-50/50"
                        }`}
                      >
                        <span className="min-w-[9.5rem] font-mono text-sm font-bold text-zimson-900">{r.reference}</span>
                        <span className="min-w-[5.5rem] text-sm font-semibold text-emerald-800">
                          {formatInr(r.brandCouponValueInr ?? 0)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{r.customerName}</span>
                        <span className="hidden text-xs text-stone-500 sm:inline">
                          {r.watchBrand} {r.watchModel}
                        </span>
                        <span className="text-xs font-medium text-amber-800">{selected ? "Open" : "Review →"}</span>
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
                            Brand mail ref:{" "}
                            <span className="font-mono font-semibold">{selectedPending.brandInvoiceRef}</span>
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
                      Voucher code is auto-generated (<span className="font-mono font-semibold">ZIM</span> + 8
                      alphanumeric) when you approve.
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
                            (selectedPending.brandCouponValidUntil
                              ? selectedPending.brandCouponValidUntil.slice(0, 10)
                              : "")
                          }
                          onChange={(e) =>
                            setValidUntilByJob((prev) => ({ ...prev, [selectedPending.id]: e.target.value }))
                          }
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
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-stone-500">Select an SRF from the list to open the approval screen.</p>
                )}
              </div>
            )}
          </Card>

          <Card title="Credit note history">
            {approved.length === 0 ? (
              <p className="text-sm text-stone-600">
                No approved vouchers yet.{" "}
                <Link to="/accounts/brand-credit-history" className="font-semibold text-zimson-800 underline">
                  View full credit note history
                </Link>
              </p>
            ) : (
              <div className="space-y-3">
                <div className="divide-y divide-zimson-100 overflow-hidden rounded-xl border border-zimson-200">
                  {approved.slice(0, 15).map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white px-4 py-3 text-sm"
                    >
                      <span className="min-w-[9.5rem] font-mono font-bold text-zimson-900">{r.reference}</span>
                      <span className="min-w-[5.5rem] font-semibold text-emerald-800">
                        {formatInr(r.brandCouponValueInr ?? 0)}
                      </span>
                      <span className="font-mono text-xs tracking-wider text-violet-900">{r.brandCouponCode ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-stone-800">{r.customerName}</span>
                      <span className="text-xs text-stone-500">
                        {r.brandCreditNoteApprovedAt
                          ? new Date(r.brandCreditNoteApprovedAt).toLocaleDateString()
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-500">
                  Showing latest {Math.min(15, approved.length)} of {approved.length}.{" "}
                  <Link to="/accounts/brand-credit-history" className="font-semibold text-zimson-800 underline">
                    Open full credit note history
                  </Link>{" "}
                  for complete details and search.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
      {approvalSuccess ? (
        <ProcessSuccessModal
          open
          title="Approved"
          description={`${approvalSuccess.reference} — voucher issued and SRF closed`}
          onBackdropClick={() => setApprovalSuccess(null)}
          actions={
            <button
              type="button"
              onClick={() => setApprovalSuccess(null)}
              className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
            >
              Done
            </button>
          }
        >
          <dl className="space-y-2 text-sm text-stone-700">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Voucher code</dt>
              <dd className="mt-0.5 font-mono text-lg font-bold tracking-wider text-zimson-900">
                {approvalSuccess.voucherCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Amount</dt>
              <dd className="mt-0.5 font-semibold text-emerald-800">{formatInr(approvalSuccess.valueInr)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Customer notified</dt>
              <dd className="mt-0.5 text-stone-800">
                {approvalSuccess.emailSent ? "Email sent." : "Email not sent — check SMTP / customer email."}
                {approvalSuccess.whatsappSent ? " WhatsApp sent." : ""}
              </dd>
            </div>
            <p className="text-xs text-stone-500">Watch retained at brand — no return dispatch.</p>
          </dl>
        </ProcessSuccessModal>
      ) : null}
      {alertModal}
    </div>
  );
}
