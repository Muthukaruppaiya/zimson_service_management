import { useCallback, useEffect, useMemo, useState } from "react";
import { TablePagination } from "../../components/ui/TablePagination";
import { usePagination } from "../../lib/usePagination";
import { Navigate } from "react-router-dom";
import { ReportDateFilter } from "../../components/reports/ReportDateFilter";
import { ReportExportButtons } from "../../components/reports/ReportExportButtons";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson } from "../../lib/api";
import { describeReportDateRange, rangeForPreset, type ReportDateRange } from "../../lib/reportDateRange";

type OtpTarget = {
  type: "mobile" | "email";
  label: string;
  status: "sent" | "failed" | "not_configured";
  error?: string;
};

type LoginEvent = {
  id: string;
  createdAt: string;
  eventType: string;
  loginId: string | null;
  userId: string | null;
  userName: string | null;
  employeeCode: string | null;
  role: string | null;
  regionId: string | null;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  otpTargets: OtpTarget[];
  otpCode: string | null;
  otpShownOnScreen: boolean | null;
  trustedDevice: boolean | null;
  message: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const EVENT_LABELS: Record<string, string> = {
  OTP_SENT: "OTP sent",
  OTP_VERIFIED: "OTP verified · signed in",
  OTP_FAILED: "OTP failed",
  LOGIN_SUCCESS: "Signed in (trusted device)",
  PASSWORD_FAILED: "Wrong password",
  ALREADY_LOGGED_IN: "Blocked · already signed in",
  LOGIN_BLOCKED: "Blocked",
  LOGOUT: "Signed out",
};

const EVENT_TONES: Record<string, string> = {
  OTP_SENT: "bg-sky-50 text-sky-900 ring-sky-300/70",
  OTP_VERIFIED: "bg-emerald-50 text-emerald-900 ring-emerald-300/70",
  LOGIN_SUCCESS: "bg-emerald-50 text-emerald-900 ring-emerald-300/70",
  OTP_FAILED: "bg-rose-50 text-rose-800 ring-rose-300/70",
  PASSWORD_FAILED: "bg-rose-50 text-rose-800 ring-rose-300/70",
  ALREADY_LOGGED_IN: "bg-amber-50 text-amber-950 ring-amber-300/70",
  LOGIN_BLOCKED: "bg-amber-50 text-amber-950 ring-amber-300/70",
  LOGOUT: "bg-stone-100 text-stone-700 ring-stone-300/70",
};

const STATUS_LABELS: Record<OtpTarget["status"], string> = {
  sent: "Delivered",
  failed: "Failed",
  not_configured: "Not configured",
};

const STATUS_TONES: Record<OtpTarget["status"], string> = {
  sent: "text-emerald-700",
  failed: "text-rose-700",
  not_configured: "text-amber-700",
};

const CSV_COLUMNS = [
  "Date & Time",
  "Event",
  "User",
  "Employee Code",
  "Login ID",
  "Role",
  "Region",
  "Store",
  "OTP Mobile",
  "Mobile Status",
  "OTP Email",
  "Email Status",
  "OTP On Screen",
  "Trusted Device",
  "IP Address",
  "Device",
  "Note",
];

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function roleLabel(role: string | null): string {
  if (!role) return "—";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function deviceLabel(ua: string | null): string {
  if (!ua) return "—";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

function targetOf(e: LoginEvent, type: OtpTarget["type"]): OtpTarget | undefined {
  return e.otpTargets.find((t) => t.type === type);
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4" aria-hidden>
      {open ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" strokeLinecap="round" />
          <path d="M10.6 10.7a2.2 2.2 0 0 0 2.7 2.7" />
          <path d="M9.9 5.5A10.4 10.4 0 0 1 12 5.2c5 0 8.8 3.8 10.2 6.8a11.4 11.4 0 0 1-4.1 4.6" />
          <path d="M6.1 6.7A11.5 11.5 0 0 0 1.8 12c1.4 3 5.2 6.8 10.2 6.8 1.2 0 2.3-.2 3.4-.6" />
        </>
      )}
    </svg>
  );
}

function yesNo(v: boolean | null): string {
  return v == null ? "—" : v ? "Yes" : "No";
}

export function LoginReportPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const isAllowed = user?.role === "super_admin" || user?.role === "admin";

  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<ReportDateRange>(() => rangeForPreset("last7") ?? { from: "", to: "" });
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("");
  const [regionId, setRegionId] = useState("");
  const [delivery, setDelivery] = useState<"" | "sent" | "failed">("");
  const [revealedOtp, setRevealedOtp] = useState<Set<string>>(() => new Set());
  const [revealAllOtp, setRevealAllOtp] = useState(false);

  function toggleOtp(id: string) {
    setRevealedOtp((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (range.from) q.set("from", range.from);
      if (range.to) q.set("to", range.to);
      const data = await apiJson<{ events: LoginEvent[] }>(`/api/reports/login-audit?${q.toString()}`);
      setEvents(data.events ?? []);
    } catch (e) {
      setEvents([]);
      setError(e instanceof ApiError ? e.message : "Could not load login report.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (eventType && e.eventType !== eventType) return false;
      if (regionId && e.regionId !== regionId) return false;
      if (delivery) {
        if (e.eventType !== "OTP_SENT") return false;
        const anySent = e.otpTargets.some((t) => t.status === "sent");
        if (delivery === "sent" && !anySent) return false;
        if (delivery === "failed" && anySent) return false;
      }
      if (q) {
        const hay = [
          e.userName,
          e.employeeCode,
          e.loginId,
          e.role,
          e.regionName,
          e.storeName,
          e.ipAddress,
          ...e.otpTargets.map((t) => t.label),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, query, eventType, regionId, delivery]);

  const stats = useMemo(() => {
    let otpSent = 0;
    let otpDelivered = 0;
    let signedIn = 0;
    let failed = 0;
    for (const e of filtered) {
      if (e.eventType === "OTP_SENT") {
        otpSent += 1;
        if (e.otpTargets.some((t) => t.status === "sent")) otpDelivered += 1;
      }
      if (e.eventType === "OTP_VERIFIED" || e.eventType === "LOGIN_SUCCESS") signedIn += 1;
      if (e.eventType === "OTP_FAILED" || e.eventType === "PASSWORD_FAILED") failed += 1;
    }
    return { otpSent, otpDelivered, signedIn, failed };
  }, [filtered]);

  const pagination = usePagination(filtered);

  const csvRows = useMemo(
    () =>
      filtered.map((e) => {
        const mobile = targetOf(e, "mobile");
        const email = targetOf(e, "email");
        return {
          "Date & Time": formatDateTime(e.createdAt),
          Event: eventLabel(e.eventType),
          User: e.userName ?? "—",
          "Employee Code": e.employeeCode ?? "—",
          "Login ID": e.loginId ?? "—",
          Role: roleLabel(e.role),
          Region: e.regionName ?? e.regionId ?? "—",
          Store: e.storeName ?? e.storeId ?? "—",
          "OTP Mobile": mobile?.label ?? "—",
          "Mobile Status": mobile ? STATUS_LABELS[mobile.status] + (mobile.error && mobile.status === "failed" ? ` (${mobile.error})` : "") : "—",
          "OTP Email": email?.label ?? "—",
          "Email Status": email ? STATUS_LABELS[email.status] + (email.error && email.status === "failed" ? ` (${email.error})` : "") : "—",
          "OTP On Screen": e.eventType === "OTP_SENT" ? yesNo(e.otpShownOnScreen) : "—",
          "Trusted Device": yesNo(e.trustedDevice),
          "IP Address": e.ipAddress ?? "—",
          Device: deviceLabel(e.userAgent),
          Note: e.message ?? "—",
        };
      }),
    [filtered],
  );

  if (!user) return null;
  if (!isAllowed) return <Navigate to="/" replace />;

  function resetFilters() {
    setQuery("");
    setEventType("");
    setRegionId("");
    setDelivery("");
    setRange(rangeForPreset("last7") ?? { from: "", to: "" });
  }

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Login report"
        description="Sign-in activity with OTP delivery details."
        actions={
          <div className="flex flex-wrap gap-2">
            <ReportExportButtons
              meta={{
                title: "Login report",
                fileBase: "login_report",
                subtitle: [describeReportDateRange(range, "Date"), `Rows: ${csvRows.length}`],
              }}
              sheets={[{ name: "Login activity", columns: CSV_COLUMNS, rows: csvRows }]}
              disabled={loading || filtered.length === 0}
            />
            <button
              type="button"
              onClick={() => setRevealAllOtp((v) => !v)}
              className="inline-flex items-center gap-1.5 border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              <EyeIcon open={!revealAllOtp} />
              {revealAllOtp ? "Hide all OTPs" : "Show all OTPs"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "OTPs sent", value: stats.otpSent, tone: "text-rlx-green" },
          { label: "OTPs delivered", value: stats.otpDelivered, tone: "text-emerald-700" },
          { label: "Successful sign-ins", value: stats.signedIn, tone: "text-rlx-green" },
          { label: "Failed attempts", value: stats.failed, tone: "text-rose-700" },
        ].map((s) => (
          <div key={s.label} className="border border-rlx-rule bg-white shadow-sm">
            <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">{s.label}</p>
            </div>
            <p className={`px-3 py-3 text-lg font-semibold ${s.tone}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <section className="mb-5 border border-rlx-rule bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</h2>
          <button type="button" onClick={resetFilters} className="ui-btn-secondary">
            Reset
          </button>
        </div>
        <div className="ui-filter-grid p-3 sm:p-4">
          <FilterField label="Search" htmlFor="login-q" className="ui-filter-span-2-sm min-w-0">
            <input
              id="login-q"
              className="ui-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="User, login ID, mobile, email, IP…"
            />
          </FilterField>
          <FilterField label="Event" htmlFor="login-event" className="min-w-0">
            <select id="login-event" className="ui-field" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All events</option>
              {Object.entries(EVENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="OTP delivery" htmlFor="login-delivery" className="min-w-0">
            <select
              id="login-delivery"
              className="ui-field"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value as typeof delivery)}
            >
              <option value="">All</option>
              <option value="sent">Delivered</option>
              <option value="failed">Not delivered</option>
            </select>
          </FilterField>
          {user.role === "super_admin" ? (
            <FilterField label="Region" htmlFor="login-region" className="min-w-0">
              <select id="login-region" className="ui-field" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FilterField>
          ) : null}
          <ReportDateFilter value={range} onChange={setRange} label="Date" idPrefix="login-date" />
        </div>
      </section>

      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-rlx-ink-muted">Loading login activity…</p>
      ) : filtered.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No login activity matches the current filters.
        </p>
      ) : (
        <>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[64rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">When</th>
                  <th className="min-w-[11rem] px-3 py-3 font-semibold">User</th>
                  <th className="min-w-[9rem] px-3 py-3 font-semibold">Event</th>
                  <th className="min-w-[16rem] px-3 py-3 font-semibold">OTP sent to</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Generated OTP</th>
                  <th className="min-w-[9rem] px-3 py-3 font-semibold">Place</th>
                  <th className="min-w-[9rem] px-3 py-3 font-semibold">Device</th>
                  <th className="min-w-[10rem] px-3 py-3 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageRows.map((e, idx) => (
                  <tr key={e.id} className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-xs text-rlx-ink-muted">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="block text-sm font-medium text-rlx-ink">{e.userName ?? e.loginId ?? "—"}</span>
                      <span className="block text-xs text-rlx-ink-muted">
                        {[e.employeeCode, roleLabel(e.role)].filter((v) => v && v !== "—").join(" · ") || "—"}
                      </span>
                      {e.loginId && e.userName ? (
                        <span className="block font-mono text-[11px] text-rlx-ink-muted">{e.loginId}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold leading-snug ring-1 ring-inset ${
                          EVENT_TONES[e.eventType] ?? "bg-rlx-bg text-rlx-ink ring-rlx-rule"
                        }`}
                      >
                        {eventLabel(e.eventType)}
                      </span>
                      {e.trustedDevice ? (
                        <span className="mt-1 block text-[11px] text-rlx-ink-muted">Trusted device</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {e.otpTargets.length === 0 ? (
                        <span className="text-rlx-ink-muted">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {e.otpTargets.map((t) => (
                            <li key={`${t.type}-${t.label}`} className="text-xs leading-snug">
                              <span className="font-semibold uppercase tracking-wide text-rlx-ink-muted">
                                {t.type === "mobile" ? "SMS" : "Email"}
                              </span>{" "}
                              <span className="font-mono text-rlx-ink">{t.label}</span>{" "}
                              <span className={`font-semibold ${STATUS_TONES[t.status]}`}>· {STATUS_LABELS[t.status]}</span>
                              {t.status === "failed" && t.error ? (
                                <span className="block break-words text-[11px] text-rose-700">{t.error}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      {e.eventType === "OTP_SENT" && e.otpShownOnScreen ? (
                        <span className="mt-1 block text-[11px] text-amber-700">Also shown on screen</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      {e.otpCode ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="min-w-[4.5rem] font-mono text-sm font-semibold tracking-[0.2em] text-rlx-green">
                            {revealAllOtp || revealedOtp.has(e.id) ? e.otpCode : "•".repeat(e.otpCode.length)}
                          </span>
                          {!revealAllOtp ? (
                            <button
                              type="button"
                              onClick={() => toggleOtp(e.id)}
                              className="inline-flex h-7 w-7 items-center justify-center border border-rlx-rule bg-white text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
                              title={revealedOtp.has(e.id) ? "Hide OTP" : "Show OTP"}
                              aria-label={revealedOtp.has(e.id) ? "Hide OTP" : "Show OTP"}
                            >
                              <EyeIcon open={!revealedOtp.has(e.id)} />
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-rlx-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="block text-sm text-rlx-ink">{e.storeName ?? e.regionName ?? "—"}</span>
                      {e.storeName && e.regionName ? (
                        <span className="block text-xs text-rlx-ink-muted">{e.regionName}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="block text-sm text-rlx-ink">{deviceLabel(e.userAgent)}</span>
                      <span className="block font-mono text-[11px] text-rlx-ink-muted">{e.ipAddress ?? "—"}</span>
                    </td>
                    <td className="break-words px-3 py-3 align-top text-xs text-rlx-ink-muted">{e.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination pagination={pagination} />
          <p className="mt-3 text-sm text-rlx-ink-muted">
            {filtered.length} of {events.length} event(s)
          </p>
        </>
      )}
    </div>
  );
}
