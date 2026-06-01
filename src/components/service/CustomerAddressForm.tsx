import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson, useApiMode } from "../../lib/api";
import { addressLine1, addressLine2 } from "../../lib/customerAddress";
import { fetchIndiaPinLookup } from "../../lib/indiaPinLookup";
import { sanitizeMultilineTextInput, sanitizePhoneDigits, sanitizeTextInput } from "../../lib/inputSanitize";
import type { CustomerAddressBlock } from "../../types/customer";
import { inputClass } from "../../lib/uiForm";

type CountryRow = { id: string; name: string; sortOrder?: number };

type Props = {
  value: CustomerAddressBlock;
  onChange: (next: CustomerAddressBlock) => void;
  countries: CountryRow[];
  disabled?: boolean;
};

function digitsPin(v: string, maxLen: number): string {
  return sanitizePhoneDigits(v, maxLen);
}

export function CustomerAddressForm({ value, onChange, countries, disabled }: Props) {
  const api = useApiMode();
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const lastAutoPinRef = useRef("");
  const failedAutoPinRef = useRef("");
  const [pinOfficeCache, setPinOfficeCache] = useState<{
    pin: string;
    offices: { name: string; district: string }[];
  } | null>(null);

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
    if (!api || !value.countryId || !String(value.state ?? "").trim()) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    void apiJson<{ districts: string[] }>(
      `/api/geo/districts?countryId=${encodeURIComponent(value.countryId)}&state=${encodeURIComponent(String(value.state ?? "").trim())}`,
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

  const pinDigits = digitsPin(value.pincode, 8);
  const isIndia = value.countryId === "IN" || (!value.countryId && pinDigits.length === 6);

  useEffect(() => {
    if (!pinOfficeCache) return;
    if (pinDigits !== pinOfficeCache.pin) setPinOfficeCache(null);
  }, [pinDigits, pinOfficeCache]);

  useEffect(() => {
    if (value.countryId && value.countryId !== "IN") setPinOfficeCache(null);
  }, [value.countryId]);

  const localityOptions = useMemo(() => {
    if (!pinOfficeCache || pinDigits !== pinOfficeCache.pin) return [];
    const d = String(value.district ?? "").trim();
    const src = d
      ? pinOfficeCache.offices.filter((o) => o.district.trim() === d)
      : pinOfficeCache.offices;
    const names = src.map((o) => o.name.trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [pinOfficeCache, pinDigits, value.district]);

  const localityKey = localityOptions.join("\u0000");

  useEffect(() => {
    if (localityOptions.length === 0) return;
    const c = String(value.city ?? "").trim();
    if (c && localityOptions.includes(c)) return;
    patch({ city: localityOptions[0] ?? "" });
  }, [localityKey, value.city, patch, localityOptions.length]);

  const applyIndiaPin = useCallback(async () => {
    setPinError(null);
    if (!api) {
      setPinError("PIN auto-fill requires the app API (contact your administrator).");
      return;
    }
    const pin = digitsPin(value.pincode, 8);
    if (pin.length !== 6) {
      setPinError("Enter a 6-digit PIN for India lookup.");
      return;
    }
    setPinBusy(true);
    try {
      const out = await fetchIndiaPinLookup(pin);
      const dList = out.districts.length > 0 ? out.districts : out.district ? [out.district] : [];
      const officesFromApi = out.postOffices.map((o) => ({
        name: o.name,
        district: o.district,
      }));
      setPinOfficeCache(officesFromApi.length > 0 ? { pin, offices: officesFromApi } : null);
      const cityNext = out.citySuggestion || officesFromApi[0]?.name || value.city;
      onChange({
        ...value,
        countryId: "IN",
        pincode: pin,
        state: out.state || value.state,
        district: out.district || dList[0] || value.district,
        city: cityNext || value.city,
      });
      if (dList.length) setDistricts((prev) => [...new Set([...dList, ...prev])].sort((a, b) => a.localeCompare(b)));
      lastAutoPinRef.current = pin;
      failedAutoPinRef.current = "";
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "PIN lookup failed.");
      setPinOfficeCache(null);
      failedAutoPinRef.current = pin;
    } finally {
      setPinBusy(false);
    }
  }, [api, onChange, value]);

  useEffect(() => {
    if (disabled || !api) return;
    if (pinDigits.length !== 6) {
      failedAutoPinRef.current = "";
      return;
    }
    if (value.countryId && value.countryId !== "IN") return;
    if (pinBusy) return;
    if (lastAutoPinRef.current === pinDigits) return;
    if (failedAutoPinRef.current === pinDigits) return;
    const t = window.setTimeout(() => {
      void applyIndiaPin();
    }, 600);
    return () => window.clearTimeout(t);
  }, [applyIndiaPin, disabled, pinBusy, pinDigits, value.countryId]);

  const line1 = addressLine1(value);
  const line2 = addressLine2(value);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-xs font-medium text-stone-600">Address line 1 *</label>
        <input
          value={line1}
          onChange={(e) =>
            patch({
              addressLine1: sanitizeMultilineTextInput(e.target.value, 200),
            })
          }
          className={inputClass}
          disabled={disabled}
          placeholder="Building, flat, area"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-medium text-stone-600">Address line 2 (optional)</label>
        <input
          value={line2}
          onChange={(e) =>
            patch({
              addressLine2: sanitizeMultilineTextInput(e.target.value, 200),
            })
          }
          className={inputClass}
          disabled={disabled}
          placeholder="Landmark, floor, etc."
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
              city: "",
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
        <label className="text-xs font-medium text-stone-600">PIN / postal code *</label>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <input
            value={value.pincode}
            onChange={(e) => {
              const next = digitsPin(e.target.value, 12);
              if (next.length !== 6) {
                lastAutoPinRef.current = "";
                failedAutoPinRef.current = "";
              }
              patch({ pincode: next });
            }}
            className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1`}
            disabled={disabled}
            inputMode="numeric"
            placeholder="6-digit PIN for India"
            maxLength={12}
          />
          <button
            type="button"
            onClick={() => void applyIndiaPin()}
            disabled={disabled || pinBusy || pinDigits.length !== 6}
            className="shrink-0 rounded-lg border border-zimson-500 bg-white px-3 py-2 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50 disabled:opacity-50"
          >
            {pinBusy ? "…" : "Fill from PIN"}
          </button>
        </div>
        {pinError ? <p className="mt-1 text-xs text-red-700">{pinError}</p> : null}
        <p className="mt-1 text-xs text-stone-500">
          For India, enter 6 digits — state, district, and locality fill automatically (or use the button).
        </p>
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
            onChange={(e) => patch({ state: sanitizeTextInput(e.target.value, 80), district: "" })}
            className={inputClass}
            disabled={disabled}
            placeholder="State / region"
          />
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">District *</label>
        {api && districts.length === 0 && String(value.state ?? "").trim() ? (
          <input
            value={value.district}
            onChange={(e) => patch({ district: sanitizeTextInput(e.target.value, 80) })}
            className={inputClass}
            disabled={disabled}
            placeholder="District (type or use PIN lookup)"
          />
        ) : api ? (
          <select
            className={inputClass}
            value={value.district}
            onChange={(e) => patch({ district: e.target.value })}
            disabled={disabled || !String(value.state ?? "").trim() || districts.length === 0}
          >
            <option value="">
              {String(value.state ?? "").trim() ? "Select district" : "Select state first"}
            </option>
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
        {isIndia && api && localityOptions.length > 0 ? (
          <select
            className={inputClass}
            value={
              localityOptions.includes(String(value.city ?? "").trim())
                ? value.city
                : localityOptions[0] ?? ""
            }
            onChange={(e) => patch({ city: sanitizeTextInput(e.target.value, 80) })}
            disabled={disabled}
          >
            <option value="">Select locality</option>
            {localityOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={value.city}
            onChange={(e) => patch({ city: sanitizeTextInput(e.target.value, 80) })}
            className={inputClass}
            disabled={disabled}
            placeholder={isIndia && api ? "Filled from PIN or type manually" : "Town or locality"}
          />
        )}
      </div>
    </div>
  );
}
