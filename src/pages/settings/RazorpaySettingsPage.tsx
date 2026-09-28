import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import type { RazorpaySettings } from "../../types/razorpaySettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

export function RazorpaySettingsPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const { showSuccess, showError, alertModal } = useMessageAlert();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [hasKeySecret, setHasKeySecret] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  const apply = (s: RazorpaySettings) => {
    setEnabled(s.enabled);
    setKeyId(s.keyId);
    setKeySecret("");
    setWebhookSecret("");
    setHasKeySecret(s.hasKeySecret);
    setHasWebhookSecret(s.hasWebhookSecret);
    setConfigured(s.configured);
    setUpdatedAt(s.updatedAt);
    setUpdatedBy(s.updatedBy);
  };

  const load = useCallback(async () => {
    if (!apiMode || !isSuperAdmin) {
      setLoading(false);
      if (!apiMode) setError("API mode is off — enable VITE_USE_API to manage Razorpay.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ settings: RazorpaySettings }>("/api/settings/razorpay");
      apply(data.settings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load Razorpay settings.");
    } finally {
      setLoading(false);
    }
  }, [apiMode, isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data = await apiJson<{ settings: RazorpaySettings }>("/api/settings/razorpay", {
        method: "PUT",
        json: {
          enabled,
          keyId,
          keySecret: keySecret.trim() || undefined,
          webhookSecret: webhookSecret.trim() || undefined,
        },
      });
      apply(data.settings);
      showSuccess("Razorpay settings saved.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not save Razorpay settings.";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Razorpay" description="Only super admin can configure payment gateway keys." />
        <p className="text-sm text-stone-600">You do not have permission to open this page.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Razorpay"
        description="Collect Quick bill, SRF advance and store billing amounts through Razorpay Checkout."
        actions={
          <Link
            to="/settings/tax"
            className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Tax &amp; billing
          </Link>
        }
      />
      {alertModal}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <Card title="Gateway keys">
        {loading ? <p className="text-sm text-stone-600">Loading…</p> : null}
        {!loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-stone-800 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zimson-400 text-zimson-700 focus:ring-zimson-500"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable Razorpay checkout
            </label>
            <p className="text-xs text-stone-500 sm:col-span-2">
              Status: {configured ? "Ready" : "Not configured"}
              {updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleString()}` : ""}
              {updatedBy ? ` by ${updatedBy}` : ""}
            </p>
            <label className="text-sm sm:col-span-2">
              <span className={labelClass}>Key ID</span>
              <input className={inputClass} value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_… or rzp_test_…" />
            </label>
            <label className="text-sm">
              <span className={labelClass}>Key secret {hasKeySecret ? "(saved)" : ""}</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder={hasKeySecret ? "Leave blank to keep current secret" : "Enter key secret"}
              />
            </label>
            <label className="text-sm">
              <span className={labelClass}>Webhook secret {hasWebhookSecret ? "(saved)" : ""}</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={hasWebhookSecret ? "Leave blank to keep current secret" : "Optional webhook secret"}
              />
            </label>
            <p className="text-xs text-stone-500 sm:col-span-2">
              Webhook URL: <span className="font-mono">/api/payments/razorpay/webhook</span> — enable{" "}
              <code>payment.captured</code> in the Razorpay dashboard.
            </p>
            <div className="sm:col-span-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Razorpay settings"}
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
