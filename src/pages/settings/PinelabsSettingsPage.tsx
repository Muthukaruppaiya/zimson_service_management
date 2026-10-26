import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import type { PinelabsEnvironment, PinelabsStoreSettings } from "../../types/pinelabsSettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

type StoreForm = {
  enabled: boolean;
  environment: PinelabsEnvironment;
  merchantId: string;
  securityToken: string;
  pineLabsStoreId: string;
  clientId: string;
  imei: string;
};

function toForm(s: PinelabsStoreSettings): StoreForm {
  return {
    enabled: s.enabled,
    environment: s.environment,
    merchantId: s.merchantId,
    securityToken: "",
    pineLabsStoreId: s.pineLabsStoreId,
    clientId: s.clientId,
    imei: s.imei,
  };
}

function emptyForm(): StoreForm {
  return {
    enabled: false,
    environment: "uat",
    merchantId: "",
    securityToken: "",
    pineLabsStoreId: "",
    clientId: "",
    imei: "",
  };
}

export function PinelabsSettingsPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const { showSuccess, showError, alertModal } = useMessageAlert();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<PinelabsStoreSettings[]>([]);
  const [activeStoreId, setActiveStoreId] = useState("");
  const [form, setForm] = useState<StoreForm>(emptyForm());

  const active = useMemo(
    () => stores.find((s) => s.storeId === activeStoreId) ?? null,
    [stores, activeStoreId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { regionName: string; stores: PinelabsStoreSettings[] }>();
    for (const s of stores) {
      const existing = map.get(s.regionId);
      if (existing) existing.stores.push(s);
      else map.set(s.regionId, { regionName: s.regionName, stores: [s] });
    }
    return [...map.values()];
  }, [stores]);

  const load = useCallback(async () => {
    if (!apiMode || !isSuperAdmin) {
      setLoading(false);
      if (!apiMode) setError("API mode is off — enable VITE_USE_API to manage Pine Labs.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ stores: PinelabsStoreSettings[] }>("/api/settings/pinelabs");
      setStores(data.stores);
      setActiveStoreId((prev) => prev || data.stores[0]?.storeId || "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load Pine Labs settings.");
    } finally {
      setLoading(false);
    }
  }, [apiMode, isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForm(active ? toForm(active) : emptyForm());
  }, [active]);

  function patchForm(partial: Partial<StoreForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function save() {
    if (!activeStoreId) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiJson<{ settings: PinelabsStoreSettings }>(
        `/api/settings/pinelabs/${encodeURIComponent(activeStoreId)}`,
        {
          method: "PUT",
          json: {
            enabled: form.enabled,
            environment: form.environment,
            merchantId: form.merchantId,
            securityToken: form.securityToken.trim() || undefined,
            pineLabsStoreId: form.pineLabsStoreId,
            clientId: form.clientId,
            imei: form.imei,
          },
        },
      );
      setStores((prev) => prev.map((s) => (s.storeId === data.settings.storeId ? data.settings : s)));
      setForm(toForm(data.settings));
      showSuccess("Pine Labs settings saved.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not save Pine Labs settings.";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Pine Labs POS" description="Only super admin can configure POS machines." />
        <p className="text-sm text-stone-600">You do not have permission to open this page.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pine Labs POS"
        description="One Plutus terminal per store."
        actions={
          <Link
            to="/settings/razorpay"
            className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Razorpay
          </Link>
        }
      />
      {alertModal}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {loading ? (
        <Card>
          <p className="text-sm text-stone-600">Loading…</p>
        </Card>
      ) : stores.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-600">Add a store under Regions &amp; stores first.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card title="Stores">
            <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
              {grouped.map((group) => (
                <div key={group.regionName}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    {group.regionName}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.stores.map((s) => {
                      const selected = s.storeId === activeStoreId;
                      return (
                        <button
                          key={s.storeId}
                          type="button"
                          onClick={() => setActiveStoreId(s.storeId)}
                          className={`rounded-lg border px-3 py-2 text-left text-sm ${
                            selected
                              ? "border-rlx-green bg-rlx-green text-white"
                              : "border-zimson-200 bg-white text-stone-800 hover:bg-zimson-50"
                          }`}
                        >
                          <span className="block font-semibold">{s.storeName}</span>
                          <span className={`block text-xs ${selected ? "text-white/80" : "text-stone-500"}`}>
                            {s.configured ? "Ready" : s.enabled ? "Incomplete" : "Not configured"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title={active ? `${active.storeName} machine` : "Machine"}>
            {!active ? (
              <p className="text-sm text-stone-600">Select a store.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-stone-800 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zimson-400 text-zimson-700 focus:ring-zimson-500"
                    checked={form.enabled}
                    onChange={(e) => patchForm({ enabled: e.target.checked })}
                  />
                  Enable Pine Labs POS
                </label>
                <p className="text-xs text-stone-500 sm:col-span-2">
                  Status: {active.configured ? "Ready" : active.enabled ? "Incomplete" : "Not configured"}
                  {active.updatedAt ? ` · Updated ${new Date(active.updatedAt).toLocaleString()}` : ""}
                  {active.updatedBy ? ` by ${active.updatedBy}` : ""}
                </p>
                <label className="text-sm">
                  <span className={labelClass}>Environment</span>
                  <select
                    className={inputClass}
                    value={form.environment}
                    onChange={(e) => patchForm({ environment: e.target.value === "production" ? "production" : "uat" })}
                  >
                    <option value="uat">UAT</option>
                    <option value="production">Production</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelClass}>Merchant ID *</span>
                  <input
                    className={inputClass}
                    value={form.merchantId}
                    onChange={(e) => patchForm({ merchantId: e.target.value })}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={labelClass}>
                    Security token * {active.hasSecurityToken ? "(saved)" : ""}
                  </span>
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    value={form.securityToken}
                    onChange={(e) => patchForm({ securityToken: e.target.value })}
                    placeholder={active.hasSecurityToken ? "Leave blank to keep current token" : ""}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelClass}>Pine Labs Store ID *</span>
                  <input
                    className={inputClass}
                    value={form.pineLabsStoreId}
                    onChange={(e) => patchForm({ pineLabsStoreId: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelClass}>Client ID *</span>
                  <input
                    className={inputClass}
                    value={form.clientId}
                    onChange={(e) => patchForm({ clientId: e.target.value })}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={labelClass}>IMEI</span>
                  <input
                    className={inputClass}
                    value={form.imei}
                    onChange={(e) => patchForm({ imei: e.target.value.replace(/\D/g, "").slice(0, 20) })}
                    inputMode="numeric"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save store machine"}
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
