import { useCallback, useEffect, useState } from "react";
import { apiJson, useApiMode } from "../../lib/api";
import type { CustomerAddressBlock } from "../../types/customer";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 transition focus:border-zimson-500 focus:ring-2";

type CountryRow = { id: string; name: string; sortOrder?: number };

type Props = {
  value: CustomerAddressBlock;
  onChange: (next: CustomerAddressBlock) => void;
  countries: CountryRow[];
  disabled?: boolean;
};

function digitsPin(v: string, maxLen: number): string {
  return v.replace(/\D/g, "").slice(0, maxLen);
}

export function CustomerAddressForm({ value, onChange, countries, disabled }: Props) {
  const api = useApiMode();
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const patch = useCallback(
    (p: Partial<CustomerAddressBlock>) => {
      onChange({ ...value, ...p });
    },
    [onChange, value],
  );

  useEffect(() => {
    if (!api || !value.countryId) {
      setStates([]);
      return;
    }
    let cancelled = false;
    void apiJson<{ states: string[] }>(`/api/geo/states?countryId=${encodeURIComponent(value.countryId)}`)
      .then((out) => {
        if (!cancelled && Array.isArray(out.states)) setStates(out.states);
      })
      .catch(() => {
        if (!cancelled) setStates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, value.countryId]);

  useEffect(() => {
    if (!api || !value.countryId || !value.state.trim()) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    void apiJson<{ districts: string[] }>(
      `/api/geo/districts?countryId=${encodeURIComponent(value.countryId)}&state=${encodeURIComponent(value.state.trim())}`,
    )
      .then((out) => {
        if (!cancelled && Array.isArray(out.districts)) setDistricts(out.districts);
      })
      .catch(() => {
        if (!cancelled) setDistricts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, value.countryId, value.state]);

  async function applyIndiaPin() {
    setPinError(null);
    const pin = digitsPin(value.pincode, 8);
    if (pin.length !== 6) {
      setPinError("Enter a 6-digit PIN for India lookup.");
      return;
    }
    if (!api) {
      setPinError("API mode is required for PIN lookup.");
      return;
    }
    setPinBusy(true);
    try {
      const out = await apiJson<{
        state: string;
        district: string;
        districts: string[];
        citySuggestion?: string;
      }>(`/api/geo/pin-lookup-in?pincode=${encodeURIComponent(pin)}`);
      const dList =
        Array.isArray(out.districts) && out.districts.length > 0 ? out.districts : out.district ? [out.district] : [];
      onChange({
        ...value,
        pincode: pin,
        state: out.state || value.state,
        district: out.district || dList[0] || value.district,
        city: (out.citySuggestion || value.city).trim() || value.city,
      });
      if (dList.length) setDistricts((prev) => [...new Set([...dList, ...prev])].sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "PIN lookup failed.");
    } finally {
      setPinBusy(false);
    }
  }

  const isIndia = value.countryId === "IN";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-medium text-stone-600">Door / plot no. *</label>
        <input
          value={value.doorNo}
          onChange={(e) => patch({ doorNo: e.target.value })}
          className={inputClass}
          disabled={disabled}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">Street *</label>
        <input
          value={value.street}
          onChange={(e) => patch({ street: e.target.value })}
          className={inputClass}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-medium text-stone-600">Country *</label>
        <select
          className={inputClass}
          value={value.countryId}
          onChange={(e) => {
            const countryId = e.target.value;
            onChange({
              ...value,
              countryId,
              state: "",
              district: "",
            });
          }}
          disabled={disabled}
        >
          <option value="">Select country</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">State *</label>
        {api ? (
          <select
            className={inputClass}
            value={value.state}
            onChange={(e) => patch({ state: e.target.value, district: "" })}
            disabled={disabled || !value.countryId || states.length === 0}
          >
            <option value="">{value.countryId ? "Select state" : "Select country first"}</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={value.state}
            onChange={(e) => patch({ state: e.target.value, district: "" })}
            className={inputClass}
            disabled={disabled}
            placeholder="State / region"
          />
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">District *</label>
        {api && districts.length === 0 && value.state.trim() ? (
          <input
            value={value.district}
            onChange={(e) => patch({ district: e.target.value })}
            className={inputClass}
            disabled={disabled}
            placeholder="District (no list for this state — type or use PIN lookup for India)"
          />
        ) : api ? (
          <select
            className={inputClass}
            value={value.district}
            onChange={(e) => patch({ district: e.target.value })}
            disabled={disabled || !value.state.trim() || districts.length === 0}
          >
            <option value="">{value.state.trim() ? "Select district" : "Select state first"}</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={value.district}
            onChange={(e) => patch({ district: e.target.value })}
            className={inputClass}
            disabled={disabled}
            placeholder="District"
          />
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">City / locality *</label>
        <input
          value={value.city}
          onChange={(e) => patch({ city: e.target.value })}
          className={inputClass}
          disabled={disabled}
          placeholder="Town or locality"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">PIN / postal code *</label>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <input
            value={value.pincode}
            onChange={(e) => patch({ pincode: digitsPin(e.target.value, 12) })}
            className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1`}
            disabled={disabled}
            inputMode="numeric"
            placeholder="Digits only"
            maxLength={12}
          />
          {isIndia && api ? (
            <button
              type="button"
              onClick={() => void applyIndiaPin()}
              disabled={disabled || pinBusy || digitsPin(value.pincode, 8).length !== 6}
              className="shrink-0 rounded-lg border border-zimson-500 bg-white px-3 py-2 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50 disabled:opacity-50"
            >
              {pinBusy ? "…" : "Fill from PIN"}
            </button>
          ) : null}
        </div>
        {pinError ? <p className="mt-1 text-xs text-red-700">{pinError}</p> : null}
        {isIndia ? (
          <p className="mt-1 text-xs text-stone-500">
            India: enter 6-digit PIN and tap <strong>Fill from PIN</strong> to load state and district from India Post
            data.
          </p>
        ) : (
          <p className="mt-1 text-xs text-stone-500">
            District list is loaded from a public location API (city-level for many countries).
          </p>
        )}
      </div>
    </div>
  );
}
