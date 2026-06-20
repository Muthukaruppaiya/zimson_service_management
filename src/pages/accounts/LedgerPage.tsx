import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { apiJson, useApiMode } from "../../lib/api";
import type { LedgerEntryRecord } from "../../types/serviceInvoiceRecord";

export function LedgerPage() {
  const apiMode = useApiMode();
  const [rows, setRows] = useState<LedgerEntryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCode, setAccountCode] = useState("");
  const [voucherRef, setVoucherRef] = useState("");

  const load = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "400" });
      if (accountCode.trim()) params.set("accountCode", accountCode.trim());
      if (voucherRef.trim()) params.set("voucherRef", voucherRef.trim());
      const out = await apiJson<{ rows: LedgerEntryRecord[] }>(`/api/accounts/ledger?${params.toString()}`);
      setRows(out.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ledger.");
    } finally {
      setLoading(false);
    }
  }, [apiMode, accountCode, voucherRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalDebit = rows.reduce((s, r) => s + r.debitInr, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditInr, 0);

  return (
    <div className="ui-page-bleed font-sans text-rlx-ink">
      <div className="bg-rlx-bg px-4 py-4 md:px-6">
        <PageHeader
          title="Payment ledger"
          description="Double-entry postings from invoices and receipt vouchers — Dr Cash/Bank, Cr Accounts Receivable."
          actions={
            <Link to="/accounts/invoice-history" className="ui-btn-secondary no-underline">
              Invoice history
            </Link>
          }
        />

        {error ? (
          <div className="mb-4 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="ui-filter-grid mb-4">
          <FilterField label="Account code" htmlFor="ledger-acct">
            <input
              id="ledger-acct"
              className="ui-field"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              placeholder="e.g. receivable, cash, bank"
            />
          </FilterField>
          <FilterField label="Voucher ref" htmlFor="ledger-voucher">
            <input
              id="ledger-voucher"
              className="ui-field"
              value={voucherRef}
              onChange={(e) => setVoucherRef(e.target.value)}
              placeholder="RCPT-… or INV-…"
            />
          </FilterField>
          <div className="flex items-end gap-2">
            <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
              Search
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-4 text-xs text-rlx-ink-muted">
          <span>
            Debit total:{" "}
            <strong className="text-rlx-ink">{totalDebit.toLocaleString(undefined, { style: "currency", currency: "INR" })}</strong>
          </span>
          <span>
            Credit total:{" "}
            <strong className="text-rlx-ink">{totalCredit.toLocaleString(undefined, { style: "currency", currency: "INR" })}</strong>
          </span>
          <span>{rows.length} line{rows.length === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <p className="text-sm text-rlx-ink-muted">Loading ledger…</p>
        ) : rows.length === 0 ? (
          <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-rlx-ink-muted">
            No ledger entries yet. Post a payment from{" "}
            <Link to="/accounts/invoice-history" className="text-rlx-green underline">
              invoice history
            </Link>
            .
          </div>
        ) : (
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-rlx-green text-[9px] font-semibold uppercase tracking-[0.2em] text-white">
                <tr>
                  <th>Posted</th>
                  <th>Voucher</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-rlx-rule ${idx % 2 ? "bg-rlx-bg" : "bg-white"}`}>
                    <td className="whitespace-nowrap text-xs text-rlx-ink-muted">{new Date(r.postedAt).toLocaleString()}</td>
                    <td className="font-mono text-[10px]">{r.voucherRef}</td>
                    <td className="text-xs uppercase">{r.voucherType}</td>
                    <td>
                      <div className="font-medium">{r.accountName}</div>
                      <div className="font-mono text-[10px] text-rlx-ink-muted">{r.accountCode}</div>
                    </td>
                    <td className="text-right">{r.debitInr > 0 ? r.debitInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</td>
                    <td className="text-right">{r.creditInr > 0 ? r.creditInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</td>
                    <td className="max-w-xs truncate text-xs text-rlx-ink-muted" title={r.narration ?? ""}>
                      {r.narration ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
