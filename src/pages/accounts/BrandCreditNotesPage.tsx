import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";

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
  brandCouponCode: string | null;
  brandCouponValueInr: number | null;
  brandCouponValidUntil: string | null;
  brandCouponReceivedAt: string | null;
  brandCreditNoteApprovedAt: string | null;
  createdAt: string;
};

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{ rows: BrandCreditNoteRow[] }>("/api/accounts/brand-credit-notes");
      setRows(out.rows);
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

  async function approve(job: BrandCreditNoteRow) {
    setBusyId(job.id);
    setFeedback((f) => ({ ...f, [job.id]: "" }));
    const valueInr = Number(valueByJob[job.id] ?? "");
    if (!Number.isFinite(valueInr) || valueInr <= 0) {
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
        `Voucher ${out.voucherCode} issued for INR ${valueInr.toLocaleString()}.`,
        "SRF closed — watch retained at brand (no return dispatch).",
        out.emailSent ? "Email sent." : "Email not sent (check customer email / SMTP).",
        out.whatsappSent ? "WhatsApp sent." : "",
      ].filter(Boolean);
      setFeedback((f) => ({ ...f, [job.id]: notifyParts.join(" ") }));
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
        description="Approve brand credit notes, set voucher value, and auto-issue a 12-digit code emailed to the customer."
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
          <Card title="Pending approval" subtitle="Supervisor logged brand credit note — enter amount and approve">
            {pending.length === 0 ? (
              <p className="text-sm text-stone-600">No credit notes awaiting approval.</p>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-amber-200/80 bg-white/90 p-4 shadow-sm">
                    <p className="font-mono text-sm font-bold text-zimson-900">{r.reference}</p>
                    <p className="text-sm text-stone-800">{r.customerName} · {r.phone}</p>
                    <p className="mt-1 text-sm text-stone-600">{r.watchBrand} {r.watchModel} · {r.serial}</p>
                    {r.brandInvoiceRef ? (
                      <p className="mt-2 text-xs text-stone-600">
                        Brand mail ref: <span className="font-mono font-semibold">{r.brandInvoiceRef}</span>
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-stone-500">
                      Voucher code is auto-generated (12 digits) when you approve. Customer receives email with voucher details.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <label className="text-xs text-stone-600">
                        Voucher amount (INR) *
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                          value={valueByJob[r.id] ?? ""}
                          onChange={(e) => setValueByJob((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="e.g. 15000"
                        />
                      </label>
                      <label className="text-xs text-stone-600">
                        Valid until
                        <input
                          type="date"
                          className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                          value={validUntilByJob[r.id] ?? (r.brandCouponValidUntil ? r.brandCouponValidUntil.slice(0, 10) : "")}
                          onChange={(e) => setValidUntilByJob((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        />
                      </label>
                      <label className="text-xs text-stone-600">
                        Approval note
                        <input
                          className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                          value={noteByJob[r.id] ?? ""}
                          onChange={(e) => setNoteByJob((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Accounts remark"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void approve(r)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        Approve, issue voucher & email customer
                      </button>
                      {feedback[r.id] ? <p className="text-xs text-stone-600">{feedback[r.id]}</p> : null}
                    </div>
                  </div>
                ))}
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
                      <th className="px-3 py-2">Voucher (12-digit)</th>
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
                        <td className="px-3 py-2">
                          {(r.brandCouponValueInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                        </td>
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
