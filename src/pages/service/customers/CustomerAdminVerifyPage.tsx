import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AppModal, AppModalDetailGrid, AppModalDetailRow } from "../../../components/ui/AppModal";
import { DataPagination } from "../../../components/ui/DataPagination";
import { FilterField } from "../../../components/ui/FilterField";
import { ListPageShell } from "../../../components/layout/ListPageShell";
import { useAuth } from "../../../context/AuthContext";
import { useMessageAlert } from "../../../hooks/useMessageAlert";
import { apiJson } from "../../../lib/api";
import { phoneLast10 } from "../../../lib/customerLookup";
import { canBypassCustomerOtp, isFullyOtpVerified } from "../../../lib/customerVerification";
import { btnTableAction } from "../../../lib/listPageStyles";
import type { CustomerRecord } from "../../../types/customer";

const PAGE_SIZE = 20;

function serviceReturnPath(raw: string | null): string | null {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/service/") || v.startsWith("//") || v.includes("://")) return null;
  return v.split("?")[0] || null;
}

function matchesQuery(c: CustomerRecord, q: string): boolean {
  if (!q) return true;
  return [
    c.customerCode ?? "",
    c.displayName,
    c.phone,
    c.alternatePhone ?? "",
    c.email,
    c.city ?? "",
    c.company ?? "",
    c.registeredStoreName ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function CustomerAdminVerifyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showSuccess, alertModal } = useMessageAlert();
  const canVerify = canBypassCustomerOtp(user?.role);

  const [rows, setRows] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const hintId = (searchParams.get("id") ?? searchParams.get("customerId") ?? "").trim();
  const hintPhone = phoneLast10(searchParams.get("phone") ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ customers: CustomerRecord[] }>("/api/customers?unverified=1");
      const list = data.customers ?? [];
      setRows(list);

      let pick: CustomerRecord | null = null;
      if (hintId) {
        pick = list.find((c) => c.id === hintId) ?? null;
        if (!pick) {
          const one = await apiJson<{ customer: CustomerRecord | null }>(
            `/api/customers?id=${encodeURIComponent(hintId)}`,
          );
          pick = one.customer;
        }
      } else if (hintPhone.length === 10) {
        pick = list.find((c) => phoneLast10(c.phone) === hintPhone) ?? null;
        if (!pick) {
          const one = await apiJson<{ customer: CustomerRecord | null }>(
            `/api/customers?phone=${encodeURIComponent(hintPhone)}`,
          );
          pick = one.customer;
        }
      }
      if (pick) setSelected(pick);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load unverified customers.");
    } finally {
      setLoading(false);
    }
  }, [hintId, hintPhone]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => matchesQuery(c, q));
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  async function confirmVerify() {
    if (!selected) return;
    if (isFullyOtpVerified(selected.phoneVerifiedAt)) {
      showError("This customer is already verified.");
      setConfirmOpen(false);
      return;
    }
    setSaving(true);
    try {
      const out = await apiJson<{ customer: CustomerRecord }>(
        `/api/customers/${encodeURIComponent(selected.id)}/admin-verify`,
        { method: "POST" },
      );
      const verified = out.customer;
      setRows((prev) => prev.filter((c) => c.id !== verified.id));
      setSelected(null);
      setConfirmOpen(false);
      const ret = serviceReturnPath(searchParams.get("returnTo"));
      if (ret) {
        const q = new URLSearchParams();
        q.set("customerId", verified.id);
        q.set("phone", phoneLast10(verified.phone));
        if (verified.customerCode?.trim()) q.set("customerCode", verified.customerCode.trim());
        if (ret.startsWith("/service/srf")) q.set("resumeStep", "1");
        if (ret.startsWith("/service/quick-bill")) q.set("resumeCustomer", "1");
        navigate(`${ret}?${q.toString()}`, { replace: true, state: { resumeCustomer: verified } });
        return;
      }
      showSuccess(
        `${verified.displayName} (${verified.phone}) is now verified. Quick bill and SRF booking will no longer ask for customer OTP.`,
        "Customer verified",
      );
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not verify customer.");
    } finally {
      setSaving(false);
    }
  }

  if (!canVerify) {
    return <Navigate to="/service/customers/master" replace />;
  }

  return (
    <>
      <ListPageShell
        breadcrumb="Customer verify"
        eyebrow="Service · Customers"
        title="Customer verify"
        countLabel={`${filtered.length} unverified`}
        error={error}
        loading={loading}
        loadingMessage="Loading unverified customers…"
        isEmpty={!loading && filtered.length === 0 && !selected}
        emptyMessage="No unverified customers match the current search. Bulk-imported records stay here until mobile OTP or admin verify."
        actions={
          <>
            <Link to="/service/customers/master" className="ui-btn-secondary no-underline">
              Customer master
            </Link>
            <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
              Refresh
            </button>
          </>
        }
      >
        <p className="mb-4 text-xs text-rlx-ink-muted">
          Use this screen when a customer will not share the OTP for Quick bill or SRF booking. Only admin and
          super admin can mark the selected customer verified without OTP. Store users still complete mobile OTP
          on registration.
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <FilterField label="Search" htmlFor="admin-verify-q" className="min-w-[16rem] flex-1">
            <input
              id="admin-verify-q"
              className="ui-field"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Name, phone, email, code, city"
            />
          </FilterField>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {filtered.length > 0 ? (
            <div>
              <p className="mb-2 text-xs text-rlx-ink-muted xl:hidden">Swipe horizontally to see more columns →</p>
              <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
                <table className="ui-table-dense w-full min-w-[40rem] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                    <tr className="border-b-2 border-rlx-gold">
                      <th className="whitespace-nowrap px-3 py-3">Code</th>
                      <th className="whitespace-nowrap px-3 py-3">Name</th>
                      <th className="whitespace-nowrap px-3 py-3">Mobile</th>
                      <th className="whitespace-nowrap px-3 py-3">Type</th>
                      <th className="whitespace-nowrap px-3 py-3">Source</th>
                      <th className="whitespace-nowrap px-3 py-3">Store</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((c, idx) => {
                      const isSel = selected?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className={`cursor-pointer border-b border-rlx-rule transition-colors duration-150 hover:bg-rlx-green-light ${
                            isSel ? "bg-rlx-green-light" : idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs">{c.customerCode || "—"}</td>
                          <td className="px-3 py-2 font-semibold">{c.displayName}</td>
                          <td className="px-3 py-2">{c.phone}</td>
                          <td className="px-3 py-2">{c.customerKind}</td>
                          <td className="px-3 py-2">
                            {c.customerDataSource === "migrated" ? "Bulk import" : "Registered"}
                          </td>
                          <td className="px-3 py-2">{c.registeredStoreName || "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className={btnTableAction}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(c);
                                setConfirmOpen(true);
                              }}
                            >
                              Verify
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > PAGE_SIZE ? (
                <DataPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                />
              ) : null}
            </div>
          ) : null}

          <aside className="border border-rlx-rule bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rlx-ink-muted">Selected customer</p>
            {selected ? (
              <>
                <h2 className="mt-2 text-base font-semibold text-rlx-ink">{selected.displayName}</h2>
                <dl className="mt-3 space-y-2 text-xs text-rlx-ink">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-rlx-ink-muted">Code</dt>
                    <dd className="font-mono">{selected.customerCode || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-rlx-ink-muted">Mobile</dt>
                    <dd>{selected.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-rlx-ink-muted">Email</dt>
                    <dd>{selected.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-rlx-ink-muted">City</dt>
                    <dd>{selected.city || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-rlx-ink-muted">Type</dt>
                    <dd>{selected.customerKind}</dd>
                  </div>
                </dl>
                {isFullyOtpVerified(selected.phoneVerifiedAt) ? (
                  <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    Already verified
                  </p>
                ) : (
                  <button
                    type="button"
                    className="mt-4 w-full border border-rlx-gold bg-rlx-green px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-rlx-green-deep"
                    onClick={() => setConfirmOpen(true)}
                  >
                    Verify without OTP
                  </button>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs text-rlx-ink-muted">Select a row to review, then verify without OTP.</p>
            )}
          </aside>
        </div>
      </ListPageShell>

      <AppModal
        open={confirmOpen && !!selected}
        onClose={() => {
          if (!saving) setConfirmOpen(false);
        }}
        title="Verify without OTP"
        eyebrow="Admin override"
        description="This marks the customer as mobile-verified so Quick bill and SRF booking can continue without the customer OTP."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="ui-btn-secondary"
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              className="border border-rlx-gold bg-rlx-green px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-rlx-green-deep disabled:opacity-50"
              onClick={() => void confirmVerify()}
            >
              {saving ? "Verifying…" : "Confirm verify"}
            </button>
          </div>
        }
      >
        {selected ? (
          <AppModalDetailGrid>
            <AppModalDetailRow label="Code">{selected.customerCode || "—"}</AppModalDetailRow>
            <AppModalDetailRow label="Name">{selected.displayName}</AppModalDetailRow>
            <AppModalDetailRow label="Mobile">{selected.phone}</AppModalDetailRow>
            <AppModalDetailRow label="Email">{selected.email || "—"}</AppModalDetailRow>
            <AppModalDetailRow label="Type">{selected.customerKind}</AppModalDetailRow>
            <AppModalDetailRow label="Source" last>
              {selected.customerDataSource === "migrated" ? "Bulk import" : "Registered"}
            </AppModalDetailRow>
          </AppModalDetailGrid>
        ) : null}
      </AppModal>
      {alertModal}
    </>
  );
}
