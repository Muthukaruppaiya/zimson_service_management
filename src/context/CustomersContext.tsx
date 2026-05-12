import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SEED_CUSTOMERS } from "../data/seedCustomers";
import { apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { lookupCustomer as runLookup, type LookupResult } from "../lib/customerLookup";
import { STORAGE_CUSTOMERS } from "../lib/storageKeys";
import type { CustomerRecord, CustomerRegistrationPayload } from "../types/customer";
import { useAuth } from "./AuthContext";

type CustomersContextValue = {
  customers: CustomerRecord[];
  lookup: (name: string, phone: string) => LookupResult;
  getById: (id: string) => CustomerRecord | undefined;
  registerCustomer: (input: CustomerRegistrationPayload) => Promise<CustomerRecord>;
  startCustomerRegistrationOtp: (input: {
    primaryPhone: string;
    otpPhone: string;
    email: string;
  }) => Promise<{ sessionId: string; demoMobileOtp: string; demoEmailOtp: string }>;
};

const CustomersContext = createContext<CustomersContextValue | null>(null);

function loadStoredCustomers(): CustomerRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMERS);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomerRecord[];
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveStoredCustomers(rows: CustomerRecord[]) {
  localStorage.setItem(STORAGE_CUSTOMERS, JSON.stringify(rows));
}

function buildDisplayName(input: CustomerRegistrationPayload): string {
  if (input.customerKind === "B2B") {
    return (input.b2bTradeDisplayName ?? "").trim();
  }
  return [input.salutation, input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

export function CustomersProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [extra, setExtra] = useState<CustomerRecord[]>(() => (api ? [] : loadStoredCustomers()));
  const localOtpSessionsRef = useRef(new Map<string, { m: string; e: string }>());

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ customers: CustomerRecord[] }>("/api/customers");
        if (!cancelled) {
          const ids = new Set(SEED_CUSTOMERS.map((c) => c.id));
          setExtra(data.customers.filter((c) => !ids.has(c.id)));
        }
      } catch {
        /* keep extra */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authReady, user?.id]);

  useEffect(() => {
    if (api || !authReady) return;
    saveStoredCustomers(extra);
  }, [api, authReady, extra]);

  const customers = useMemo(() => [...SEED_CUSTOMERS, ...extra], [extra]);

  const lookup = useCallback(
    (name: string, phone: string) => runLookup(customers, name, phone),
    [customers],
  );

  const getById = useCallback(
    (id: string) => customers.find((c) => c.id === id),
    [customers],
  );

  const startCustomerRegistrationOtp = useCallback(
    async (input: { primaryPhone: string; otpPhone: string; email: string }) => {
      if (!api) {
        const sessionId = `local-${createId("sess")}`;
        const demoMobileOtp = String(Math.floor(100000 + Math.random() * 900000));
        const demoEmailOtp = String(Math.floor(100000 + Math.random() * 900000));
        localOtpSessionsRef.current.set(sessionId, { m: demoMobileOtp, e: demoEmailOtp });
        return { sessionId, demoMobileOtp, demoEmailOtp };
      }
      return apiJson<{ sessionId: string; demoMobileOtp: string; demoEmailOtp: string }>(
        "/api/customers/register-otp-session",
        {
          method: "POST",
          json: {
            primaryPhone: input.primaryPhone.trim(),
            otpPhone: input.otpPhone.trim(),
            email: input.email.trim(),
          },
        },
      );
    },
    [api],
  );

  const registerCustomer = useCallback(
    async (input: CustomerRegistrationPayload): Promise<CustomerRecord> => {
      if (api) {
        const data = await apiJson<{ customer: CustomerRecord }>("/api/customers", {
          method: "POST",
          json: {
            sessionId: input.sessionId,
            mobileOtp: input.mobileOtp.trim(),
            emailOtp: input.emailOtp.trim(),
            customerKind: input.customerKind,
            salutation: input.salutation.trim(),
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone: input.phone.trim(),
            otpPhone: input.otpPhone.trim(),
            alternatePhone: input.alternatePhone?.trim(),
            telephone: input.telephone?.trim(),
            email: input.email.trim(),
            dob: input.dob?.trim() || null,
            anniversaryDate: input.anniversaryDate?.trim() || null,
            billingAddress: input.billingAddress,
            shippingAddress: input.shippingAddress,
            sameShippingAsBilling: input.sameShippingAsBilling,
            b2bTradeDisplayName: input.b2bTradeDisplayName?.trim(),
            taxPreference: input.taxPreference,
            company: input.company?.trim(),
            gst: input.gst?.trim(),
            pan: input.pan?.trim(),
            remarkAttention: input.remarkAttention?.trim(),
            referenceName: input.referenceName?.trim(),
            representativeName: input.representativeName?.trim(),
          },
        });
        setExtra((prev) => [...prev, data.customer]);
        return data.customer;
      }

      const w = localOtpSessionsRef.current.get(input.sessionId);
      if (!w || w.m !== input.mobileOtp.trim() || w.e !== input.emailOtp.trim()) {
        throw new Error("Incorrect mobile or email OTP (local demo).");
      }
      localOtpSessionsRef.current.delete(input.sessionId);

      const now = new Date().toISOString();
      const row: CustomerRecord = {
        id: createId("cust"),
        customerCode: `CUST-L-${Date.now().toString(36).toUpperCase().slice(-8)}`,
        displayName: buildDisplayName(input),
        salutation: input.salutation.trim() || undefined,
        firstName: input.firstName.trim() || undefined,
        lastName: input.lastName.trim() || undefined,
        phone: input.phone.trim(),
        otpPhone: input.otpPhone.trim() || null,
        alternatePhone: input.alternatePhone?.trim() || undefined,
        telephone: input.telephone?.trim() || null,
        email: input.email.trim(),
        dob: input.dob?.trim() || null,
        anniversaryDate: input.anniversaryDate?.trim() || null,
        address: undefined,
        city: `${input.billingAddress.city}, ${input.billingAddress.district}`.slice(0, 120),
        billingAddress: input.billingAddress,
        shippingAddress: input.sameShippingAsBilling ? input.billingAddress : input.shippingAddress,
        customerKind: input.customerKind,
        company: input.company?.trim() || undefined,
        gst: input.gst?.trim().toUpperCase() || undefined,
        pan: input.pan?.trim().toUpperCase() || undefined,
        taxPreference: input.customerKind === "B2B" ? input.taxPreference ?? "with_tax" : null,
        b2bTradeDisplayName: input.customerKind === "B2B" ? input.b2bTradeDisplayName?.trim() ?? null : null,
        remarkAttention: input.remarkAttention?.trim() || null,
        referenceName: input.referenceName?.trim() || null,
        representativeName: input.representativeName?.trim() || null,
        phoneVerifiedAt: now,
        emailVerifiedAt: now,
        customerDataSource: "registered",
        createdAt: now,
      };
      const next = [...extra, row];
      setExtra(next);
      saveStoredCustomers(next);
      return row;
    },
    [api, extra],
  );

  const value = useMemo(
    () => ({
      customers,
      lookup,
      getById,
      registerCustomer,
      startCustomerRegistrationOtp,
    }),
    [customers, lookup, getById, registerCustomer, startCustomerRegistrationOtp],
  );

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error("useCustomers must be used within CustomersProvider");
  return ctx;
}
