import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

type AccountSetup = {
  financialYearStart: string;
  baseCurrency: string;
  roundingMode: "nearest" | "up" | "down";
  autoPostSales: boolean;
  autoPostPurchase: boolean;
  voucherPrefixReceipt: string;
  voucherPrefixPayment: string;
  voucherPrefixJournal: string;
  paymentModes: string[];
  defaultLedgers: {
    sales: string;
    purchase: string;
    receivable: string;
    payable: string;
    cash: string;
    bank: string;
    taxOutput: string;
    taxInput: string;
  };
};

const STORAGE_KEY = "zimson_accounts_setup_v1";

function normalizePaymentModesList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))];
}

const defaultSetup: AccountSetup = {
  financialYearStart: "04-01",
  baseCurrency: "INR",
  roundingMode: "nearest",
  autoPostSales: true,
  autoPostPurchase: true,
  voucherPrefixReceipt: "RCPT",
  voucherPrefixPayment: "PMT",
  voucherPrefixJournal: "JV",
  paymentModes: ["Cash", "Card", "UPI", "Bank transfer"],
  defaultLedgers: {
    sales: "Service Sales",
    purchase: "Spare Purchase",
    receivable: "Accounts Receivable",
    payable: "Accounts Payable",
    cash: "Cash In Hand",
    bank: "Bank Account",
    taxOutput: "Output GST",
    taxInput: "Input GST",
  },
};

function loadSetup(): AccountSetup {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSetup;
    const parsed = JSON.parse(raw) as Partial<AccountSetup>;
    const mergedLedgers = { ...defaultSetup.defaultLedgers, ...(parsed.defaultLedgers ?? {}) };
    const modes = normalizePaymentModesList(parsed.paymentModes);
    return {
      ...defaultSetup,
      ...parsed,
      defaultLedgers: mergedLedgers,
      paymentModes: modes.length > 0 ? modes : [...defaultSetup.paymentModes],
    };
  } catch {
    return defaultSetup;
  }
}

export function AccountsSetupPage() {
  const [setup, setSetup] = useState<AccountSetup>(() => loadSetup());
  const [ok, setOk] = useState<string | null>(null);
  const [paymentModeInput, setPaymentModeInput] = useState("");
  const [paymentModeHint, setPaymentModeHint] = useState<string | null>(null);

  function addPaymentMode() {
    const val = paymentModeInput.trim();
    if (!val) {
      setPaymentModeHint("Enter a name for the payment mode.");
      return;
    }
    const modes = normalizePaymentModesList(setup.paymentModes);
    const base = modes.length > 0 ? modes : [...defaultSetup.paymentModes];
    if (base.some((m) => m.toLowerCase() === val.toLowerCase())) {
      setPaymentModeHint("That payment mode is already in the list (check spelling / duplicates).");
      return;
    }
    setSetup((s) => {
      const m = normalizePaymentModesList(s.paymentModes);
      const b = m.length > 0 ? m : [...defaultSetup.paymentModes];
      if (b.some((x) => x.toLowerCase() === val.toLowerCase())) return s;
      return { ...s, paymentModes: [...b, val] };
    });
    setPaymentModeInput("");
    setPaymentModeHint(null);
  }

  function save() {
    const normalizedModes = normalizePaymentModesList(setup.paymentModes);
    const paymentModes =
      normalizedModes.length > 0 ? normalizedModes : [...defaultSetup.paymentModes];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...setup, paymentModes }));
    setOk("Accounts setup saved.");
    setTimeout(() => setOk(null), 2000);
  }

  const checklist = useMemo(
    () => [
      "Financial year and voucher series",
      "Sales and purchase posting defaults",
      "Receivable / payable ledger heads",
      "Cash and bank control ledgers",
      "GST input / output ledgers",
      "Payment mode master for billing and receipts",
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Accounts setup" description="Basic finance configuration for service management operations." />
      {ok ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Core controls">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-stone-600">Financial year start (MM-DD)
              <input className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.financialYearStart} onChange={(e) => setSetup((s) => ({ ...s, financialYearStart: e.target.value }))} />
            </label>
            <label className="text-xs font-medium text-stone-600">Base currency
              <input className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.baseCurrency} onChange={(e) => setSetup((s) => ({ ...s, baseCurrency: e.target.value.toUpperCase() }))} />
            </label>
            <label className="text-xs font-medium text-stone-600">Rounding mode
              <select className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.roundingMode} onChange={(e) => setSetup((s) => ({ ...s, roundingMode: e.target.value as AccountSetup["roundingMode"] }))}>
                <option value="nearest">Nearest</option>
                <option value="up">Always up</option>
                <option value="down">Always down</option>
              </select>
            </label>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setup.autoPostSales} onChange={(e) => setSetup((s) => ({ ...s, autoPostSales: e.target.checked }))} />Auto-post sales</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setup.autoPostPurchase} onChange={(e) => setSetup((s) => ({ ...s, autoPostPurchase: e.target.checked }))} />Auto-post purchase</label>
            </div>
          </div>
        </Card>

        <Card title="Voucher series">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-stone-600">Receipt prefix
              <input className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.voucherPrefixReceipt} onChange={(e) => setSetup((s) => ({ ...s, voucherPrefixReceipt: e.target.value.toUpperCase() }))} />
            </label>
            <label className="text-xs font-medium text-stone-600">Payment prefix
              <input className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.voucherPrefixPayment} onChange={(e) => setSetup((s) => ({ ...s, voucherPrefixPayment: e.target.value.toUpperCase() }))} />
            </label>
            <label className="text-xs font-medium text-stone-600">Journal prefix
              <input className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.voucherPrefixJournal} onChange={(e) => setSetup((s) => ({ ...s, voucherPrefixJournal: e.target.value.toUpperCase() }))} />
            </label>
          </div>
        </Card>

        <Card title="Default ledgers">
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(setup.defaultLedgers) as Array<keyof AccountSetup["defaultLedgers"]>).map((k) => (
              <label key={k} className="text-xs font-medium capitalize text-stone-600">{k}
                <input className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm" value={setup.defaultLedgers[k]} onChange={(e) => setSetup((s) => ({ ...s, defaultLedgers: { ...s.defaultLedgers, [k]: e.target.value } }))} />
              </label>
            ))}
          </div>
        </Card>

        <Card title="Payment modes">
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm"
              value={paymentModeInput}
              onChange={(e) => {
                setPaymentModeInput(e.target.value);
                if (paymentModeHint) setPaymentModeHint(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPaymentMode();
                }
              }}
              placeholder="Add payment mode"
            />
            <button
              type="button"
              className="shrink-0 rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700"
              onClick={addPaymentMode}
            >
              Add
            </button>
          </div>
          {paymentModeHint ? <p className="mb-2 text-xs text-amber-800">{paymentModeHint}</p> : null}
          <div className="flex flex-wrap gap-2">
            {normalizePaymentModesList(setup.paymentModes).map((mode) => (
              <button
                key={mode}
                type="button"
                className="rounded-full border border-zimson-300 bg-white px-3 py-1 text-xs hover:bg-zimson-50"
                onClick={() =>
                  setSetup((s) => ({
                    ...s,
                    paymentModes: normalizePaymentModesList(s.paymentModes).filter((m) => m !== mode),
                  }))
                }
              >
                {mode} ×
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Basic setup checklist" className="mt-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
      <div className="mt-4">
        <button type="button" onClick={save} className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white">
          Save accounts setup
        </button>
      </div>
    </div>
  );
}

