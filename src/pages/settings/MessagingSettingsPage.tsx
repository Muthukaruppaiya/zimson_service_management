import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import type { MessagingSettings } from "../../types/messagingSettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-zimson-400 text-zimson-700 focus:ring-zimson-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function MessagingSettingsPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string; updatedBy: string | null } | null>(null);

  const [smsEnabled, setSmsEnabled] = useState(true);
  const [smsUrl, setSmsUrl] = useState("");
  const [smsToken, setSmsToken] = useState("");
  const [smsTemplateId, setSmsTemplateId] = useState("");
  const [smsSender, setSmsSender] = useState("ZIMSON");
  const [smsService, setSmsService] = useState("SI");
  const [smsOtpMessageTemplate, setSmsOtpMessageTemplate] = useState("");
  const [hasSmsToken, setHasSmsToken] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpOtpSubject, setSmtpOtpSubject] = useState("");
  const [smtpOtpMessage, setSmtpOtpMessage] = useState("");
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false);

  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [qikchatApiKey, setQikchatApiKey] = useState("");
  const [qikchatApiBaseUrl, setQikchatApiBaseUrl] = useState("https://api.qikchat.in");
  const [qikchatTemplateName, setQikchatTemplateName] = useState("invoice");
  const [qikchatTemplateLanguage, setQikchatTemplateLanguage] = useState("en");
  const [qikchatTrackingTemplateName, setQikchatTrackingTemplateName] = useState("customer_link");
  const [qikchatTrackingTextTemplateName, setQikchatTrackingTextTemplateName] = useState("");
  const [qikchatApprovalTemplateName, setQikchatApprovalTemplateName] = useState("site_visit_approval");
  const [qikchatTrackingTemplateBody, setQikchatTrackingTemplateBody] = useState("");
  const [qikchatApprovalTemplateBody, setQikchatApprovalTemplateBody] = useState("");
  const [qikchatInvoiceTemplateBody, setQikchatInvoiceTemplateBody] = useState("");
  const [whatsappInvoiceMode, setWhatsappInvoiceMode] = useState<"template" | "media">("template");
  const [messagingPublicBaseUrl, setMessagingPublicBaseUrl] = useState("");
  const [whatsappInvoiceDryRun, setWhatsappInvoiceDryRun] = useState(false);
  const [hasQikchatApiKey, setHasQikchatApiKey] = useState(false);

  const [workdriveForInvoice, setWorkdriveForInvoice] = useState(false);
  const [workdriveToken, setWorkdriveToken] = useState("");
  const [workdriveUploadUrl, setWorkdriveUploadUrl] = useState("");
  const [workdriveHeaderName, setWorkdriveHeaderName] = useState("");
  const [hasWorkdriveToken, setHasWorkdriveToken] = useState(false);

  const [exposeDemoOtp, setExposeDemoOtp] = useState<"auto" | "true" | "false">("auto");

  const applySettings = (s: MessagingSettings) => {
    setSmsEnabled(s.smsEnabled);
    setSmsUrl(s.smsUrl);
    setSmsTemplateId(s.smsTemplateId);
    setSmsSender(s.smsSender);
    setSmsService(s.smsService);
    setSmsOtpMessageTemplate(s.smsOtpMessageTemplate);
    setHasSmsToken(s.hasSmsToken);
    setSmsToken("");

    setEmailEnabled(s.emailEnabled);
    setSmtpHost(s.smtpHost);
    setSmtpPort(String(s.smtpPort));
    setSmtpUser(s.smtpUser);
    setSmtpFrom(s.smtpFrom);
    setSmtpOtpSubject(s.smtpOtpSubject);
    setSmtpOtpMessage(s.smtpOtpMessage);
    setHasSmtpPassword(s.hasSmtpPassword);
    setSmtpPassword("");

    setWhatsappEnabled(s.whatsappEnabled);
    setQikchatApiBaseUrl(s.qikchatApiBaseUrl);
    setQikchatTemplateName(s.qikchatTemplateName);
    setQikchatTemplateLanguage(s.qikchatTemplateLanguage);
    setQikchatTrackingTemplateName(s.qikchatTrackingTemplateName);
    setQikchatTrackingTextTemplateName(s.qikchatTrackingTextTemplateName);
    setQikchatApprovalTemplateName(s.qikchatApprovalTemplateName);
    setQikchatTrackingTemplateBody(s.qikchatTrackingTemplateBody);
    setQikchatApprovalTemplateBody(s.qikchatApprovalTemplateBody);
    setQikchatInvoiceTemplateBody(s.qikchatInvoiceTemplateBody);
    setWhatsappInvoiceMode(s.whatsappInvoiceMode);
    setMessagingPublicBaseUrl(s.messagingPublicBaseUrl);
    setWhatsappInvoiceDryRun(s.whatsappInvoiceDryRun);
    setHasQikchatApiKey(s.hasQikchatApiKey);
    setQikchatApiKey("");

    setWorkdriveForInvoice(s.workdriveForInvoice);
    setWorkdriveUploadUrl(s.workdriveUploadUrl);
    setWorkdriveHeaderName(s.workdriveHeaderName);
    setHasWorkdriveToken(s.hasWorkdriveToken);
    setWorkdriveToken("");

    setExposeDemoOtp(s.exposeDemoOtp === true ? "true" : s.exposeDemoOtp === false ? "false" : "auto");
    setMeta({
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
    });
  };

  const load = useCallback(async () => {
    if (!apiMode || !isSuperAdmin) {
      setLoading(false);
      if (!apiMode) setError("API mode is off — enable VITE_USE_API to manage messaging settings.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ settings: MessagingSettings }>("/api/settings/messaging");
      applySettings(data.settings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load messaging settings.");
    } finally {
      setLoading(false);
    }
  }, [apiMode, isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiMode || !isSuperAdmin) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload = {
        smsEnabled,
        smsUrl: smsUrl.trim(),
        smsToken: smsToken.trim(),
        smsTemplateId: smsTemplateId.trim(),
        smsSender: smsSender.trim(),
        smsService: smsService.trim(),
        smsOtpMessageTemplate: smsOtpMessageTemplate.trim(),

        emailEnabled,
        smtpHost: smtpHost.trim(),
        smtpPort: Number.parseInt(smtpPort, 10) || 587,
        smtpUser: smtpUser.trim(),
        smtpPassword: smtpPassword.trim(),
        smtpFrom: smtpFrom.trim(),
        smtpOtpSubject: smtpOtpSubject.trim(),
        smtpOtpMessage: smtpOtpMessage.trim(),

        whatsappEnabled,
        qikchatApiKey: qikchatApiKey.trim(),
        qikchatApiBaseUrl: qikchatApiBaseUrl.trim(),
        qikchatTemplateName: qikchatTemplateName.trim(),
        qikchatTemplateLanguage: qikchatTemplateLanguage.trim(),
        qikchatTrackingTemplateName: qikchatTrackingTemplateName.trim(),
        qikchatTrackingTextTemplateName: qikchatTrackingTextTemplateName.trim(),
        qikchatApprovalTemplateName: qikchatApprovalTemplateName.trim(),
        qikchatTrackingTemplateBody: qikchatTrackingTemplateBody.trim(),
        qikchatApprovalTemplateBody: qikchatApprovalTemplateBody.trim(),
        qikchatInvoiceTemplateBody: qikchatInvoiceTemplateBody.trim(),
        whatsappInvoiceMode,
        messagingPublicBaseUrl: messagingPublicBaseUrl.trim(),
        whatsappInvoiceDryRun,

        workdriveForInvoice,
        workdriveToken: workdriveToken.trim(),
        workdriveUploadUrl: workdriveUploadUrl.trim(),
        workdriveHeaderName: workdriveHeaderName.trim(),

        exposeDemoOtp: exposeDemoOtp === "auto" ? null : exposeDemoOtp === "true",
      };
      const data = await apiJson<{ settings: MessagingSettings }>("/api/settings/messaging", {
        method: "PUT",
        json: payload,
      });
      applySettings(data.settings);
      setSavedMsg("Saved. Changes apply immediately — restart is not required.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="SMS, email & WhatsApp" description="Super admin only." />
        <Card className="p-6 text-sm text-stone-700">
          Only a <strong>super admin</strong> can view or edit messaging provider credentials.
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="SMS, email & WhatsApp"
        description="Qikberry SMS, SMTP email, and Qikchat WhatsApp — all credentials and templates are stored in the database."
        actions={
          <Link
            to="/settings/tax"
            className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Tax &amp; billing
          </Link>
        }
      />

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}
      {savedMsg && (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {savedMsg}
        </p>
      )}

      {loading ? (
        <Card className="p-8 text-center text-sm text-stone-500">Loading…</Card>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold text-zimson-900">SMS (Qikberry)</h2>
            <p className="mt-1 text-sm text-stone-600">OTP and transactional SMS via Qikberry REST API.</p>
            <div className="mt-4 space-y-4">
              <Toggle checked={smsEnabled} onChange={setSmsEnabled} label="SMS channel enabled" />
              <div className="ui-form-grid">
                <div>
                  <span className={labelClass}>API URL</span>
                  <input className={inputClass} value={smsUrl} onChange={(e) => setSmsUrl(e.target.value)} />
                </div>
                <div>
                  <span className={labelClass}>Template ID</span>
                  <input
                    className={inputClass}
                    value={smsTemplateId}
                    onChange={(e) => setSmsTemplateId(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>Sender ID</span>
                  <input className={inputClass} value={smsSender} onChange={(e) => setSmsSender(e.target.value)} />
                </div>
                <div>
                  <span className={labelClass}>Service</span>
                  <input className={inputClass} value={smsService} onChange={(e) => setSmsService(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>
                    Access token {hasSmsToken ? "(saved — leave blank to keep)" : ""}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    placeholder={hasSmsToken ? "••••••••" : "Paste Qikberry SMS token"}
                    value={smsToken}
                    onChange={(e) => setSmsToken(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>OTP message template (use {"{{1}}"} for OTP)</span>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={smsOtpMessageTemplate}
                    onChange={(e) => setSmsOtpMessageTemplate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-zimson-900">Email (SMTP)</h2>
            <p className="mt-1 text-sm text-stone-600">Registration and OTP email. If disabled or misconfigured, email OTP is shown on screen.</p>
            <div className="mt-4 space-y-4">
              <Toggle checked={emailEnabled} onChange={setEmailEnabled} label="Email channel enabled" />
              <div className="ui-form-grid">
                <div>
                  <span className={labelClass}>SMTP host</span>
                  <input className={inputClass} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                </div>
                <div>
                  <span className={labelClass}>SMTP port</span>
                  <input className={inputClass} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                </div>
                <div>
                  <span className={labelClass}>Username</span>
                  <input className={inputClass} value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                </div>
                <div>
                  <span className={labelClass}>
                    Password {hasSmtpPassword ? "(saved — leave blank to keep)" : ""}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    placeholder={hasSmtpPassword ? "••••••••" : "App password"}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>From address</span>
                  <input className={inputClass} value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
                </div>
                <div>
                  <span className={labelClass}>OTP subject</span>
                  <input
                    className={inputClass}
                    value={smtpOtpSubject}
                    onChange={(e) => setSmtpOtpSubject(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>OTP body (use {"{{otp}}"} )</span>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={smtpOtpMessage}
                    onChange={(e) => setSmtpOtpMessage(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-zimson-900">WhatsApp (Qikchat)</h2>
            <p className="mt-1 text-sm text-stone-600">
              Invoice PDF delivery and SRF tracking / approval messages via approved Qikchat templates.
            </p>
            <div className="mt-4 space-y-4">
              <Toggle checked={whatsappEnabled} onChange={setWhatsappEnabled} label="WhatsApp channel enabled" />
              <div className="ui-form-grid">
                <div>
                  <span className={labelClass}>API base URL</span>
                  <input
                    className={inputClass}
                    value={qikchatApiBaseUrl}
                    onChange={(e) => setQikchatApiBaseUrl(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>Invoice template name</span>
                  <input
                    className={inputClass}
                    value={qikchatTemplateName}
                    onChange={(e) => setQikchatTemplateName(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>Template language</span>
                  <input
                    className={inputClass}
                    value={qikchatTemplateLanguage}
                    onChange={(e) => setQikchatTemplateLanguage(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>Tracking template name (with PDF)</span>
                  <input
                    className={inputClass}
                    value={qikchatTrackingTemplateName}
                    onChange={(e) => setQikchatTrackingTemplateName(e.target.value)}
                    placeholder="customer_link"
                  />
                </div>
                <div>
                  <span className={labelClass}>Tracking fallback template (no PDF)</span>
                  <input
                    className={inputClass}
                    value={qikchatTrackingTextTemplateName}
                    onChange={(e) => setQikchatTrackingTextTemplateName(e.target.value)}
                    placeholder="Same as tracking, or a body-only template"
                  />
                </div>
                <div>
                  <span className={labelClass}>Re-estimate approval template name</span>
                  <input
                    className={inputClass}
                    value={qikchatApprovalTemplateName}
                    onChange={(e) => setQikchatApprovalTemplateName(e.target.value)}
                    placeholder="site_visit_approval"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>
                    Tracking template body (register in Meta — {"{{1}}"} name, {"{{2}}"} SRF, {"{{3}}"} URL)
                  </span>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={qikchatTrackingTemplateBody}
                    onChange={(e) => setQikchatTrackingTemplateBody(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>
                    Approval template body ({"{{1}}"} name, {"{{2}}"} SRF, {"{{3}}"} reason, {"{{4}}"} URL)
                  </span>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={qikchatApprovalTemplateBody}
                    onChange={(e) => setQikchatApprovalTemplateBody(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>
                    Invoice template body ({"{{1}}"} name, {"{{2}}"} invoice no — PDF in header)
                  </span>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={qikchatInvoiceTemplateBody}
                    onChange={(e) => setQikchatInvoiceTemplateBody(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>Invoice send mode</span>
                  <select
                    className={inputClass}
                    value={whatsappInvoiceMode}
                    onChange={(e) => setWhatsappInvoiceMode(e.target.value as "template" | "media")}
                  >
                    <option value="template">Template (new customers)</option>
                    <option value="media">Media (within 24h window)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>
                    API key {hasQikchatApiKey ? "(saved — leave blank to keep)" : ""}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    placeholder={hasQikchatApiKey ? "••••••••" : "QIKCHAT-API-KEY"}
                    value={qikchatApiKey}
                    onChange={(e) => setQikchatApiKey(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>Public PDF base URL (HTTPS)</span>
                  <input
                    className={inputClass}
                    placeholder="https://api.yourdomain.com"
                    value={messagingPublicBaseUrl}
                    onChange={(e) => setMessagingPublicBaseUrl(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    Must be your public site/API host where <code>/api</code> reaches Node (e.g.{" "}
                    <code>https://zimsonwatchcare.com</code>). PDFs are served at{" "}
                    <code>/api/messaging/public-invoice-pdf/…</code> — not the React HTML page. Test:{" "}
                    <code>/api/messaging/public-ping</code>. Local dev: enable auto-tunnel in server settings.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Toggle
                    checked={whatsappInvoiceDryRun}
                    onChange={setWhatsappInvoiceDryRun}
                    label="Dry run — save PDF only, do not call WhatsApp"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-zimson-900">Work Drive (optional)</h2>
            <p className="mt-1 text-sm text-stone-600">Upload invoice PDF to Qikberry Work Drive when no public API URL is available.</p>
            <div className="mt-4 space-y-4">
              <Toggle
                checked={workdriveForInvoice}
                onChange={setWorkdriveForInvoice}
                label="Use Work Drive for invoice PDFs"
              />
              <div className="ui-form-grid">
                <div className="sm:col-span-2">
                  <span className={labelClass}>Upload URL</span>
                  <input
                    className={inputClass}
                    value={workdriveUploadUrl}
                    onChange={(e) => setWorkdriveUploadUrl(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>
                    Work Drive token {hasWorkdriveToken ? "(saved — leave blank to keep)" : ""}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    value={workdriveToken}
                    onChange={(e) => setWorkdriveToken(e.target.value)}
                  />
                </div>
                <div>
                  <span className={labelClass}>Extra header name (optional)</span>
                  <input
                    className={inputClass}
                    value={workdriveHeaderName}
                    onChange={(e) => setWorkdriveHeaderName(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-zimson-900">OTP on screen</h2>
            <div className="mt-3">
              <span className={labelClass}>Show OTP in UI when channel fails</span>
              <select
                className={`${inputClass} max-w-md`}
                value={exposeDemoOtp}
                onChange={(e) => setExposeDemoOtp(e.target.value as "auto" | "true" | "false")}
              >
                <option value="auto">Auto — show when SMS/email not configured</option>
                <option value="true">Always show on screen</option>
                <option value="false">Never show on screen</option>
              </select>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-xl bg-zimson-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-900 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save messaging settings"}
            </button>
            {meta && (
              <p className="text-xs text-stone-500">
                Last updated {new Date(meta.updatedAt).toLocaleString()}
                {meta.updatedBy ? ` by ${meta.updatedBy}` : ""}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
