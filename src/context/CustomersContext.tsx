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

type LocalRegOtpSession = {
  phoneLast10: string;
  mobileCode: string;
  mobileVerified: boolean;
  emailNorm: string | null;
  emailCode: string | null;
  emailVerified: boolean;
};

function phoneLast10Local(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

type CustomersContextValue = {
  customers: CustomerRecord[];
  lookup: (name: string, phone: string) => LookupResult;
  getById: (id: string) => CustomerRecord | undefined;
  registerCustomer: (input: CustomerRegistrationPayload) => Promise<CustomerRecord>;
  startRegistrationMobileOtp: (input: { primaryPhone: string; otpPhone: string }) => Promise<{
    sessionId: string;
    demoMobileOtp: string;
  }>;
  confirmRegistrationMobileOtp: (input: { sessionId: string; otp: string }) => Promise<void>;
  startRegistrationEmailOtp: (input: { sessionId: string; email: string }) => Promise<{ demoEmailOtp: string }>;
  confirmRegistrationEmailOtp: (input: { sessionId: string; otp: string }) => Promise<void>;
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
  const localOtpSessionsRef = useRef(new Map<string, LocalRegOtpSession>());

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

  const startRegistrationMobileOtp = useCallback(
    async (input: { primaryPhone: string; otpPhone: string }) => {
      const primaryP10 = phoneLast10Local(input.primaryPhone.trim());
      if (primaryP10.length !== 10) {
        throw new Error("Primary mobile must be 10 digits.");
      }
      const target = input.otpPhone.trim() ? input.otpPhone.trim() : input.primaryPhone.trim();
      const p10 = phoneLast10Local(target);
      if (p10.length !== 10) {
        throw new Error("Enter a valid 10-digit mobile for OTP (or fill OTP mobile).");
      }
      if (!api) {
        const sessionId = `local-${createId("sess")}`;
        const demoMobileOtp = String(Math.floor(100000 + Math.random() * 900000));
        localOtpSessionsRef.current.set(sessionId, {
          phoneLast10: p10,
          mobileCode: demoMobileOtp,
          mobileVerified: false,
          emailNorm: null,
          emailCode: null,
          emailVerified: false,
        });
        return { sessionId, demoMobileOtp };
      }
      return apiJson<{ sessionId: string; demoMobileOtp: string }>("/api/customers/register-otp/start-mobile", {
        method: "POST",
        json: {
          primaryPhone: input.primaryPhone.trim(),
          otpPhone: input.otpPhone.trim(),
        },
      });
    },
    [api],
  );

  const confirmRegistrationMobileOtp = useCallback(
    async (input: { sessionId: string; otp: string }) => {
      const otp = input.otp.trim();
      if (!api) {
        const sess = localOtpSessionsRef.current.get(input.sessionId);
        if (!sess) throw new Error("Unknown OTP session (local demo).");
        if (otp !== sess.mobileCode) throw new Error("Incorrect mobile OTP (local demo).");
        sess.mobileVerified = true;
        return;
      }
      await apiJson<{ ok: boolean }>("/api/customers/register-otp/confirm-mobile", {
        method: "POST",
        json: { sessionId: input.sessionId, otp },
      });
    },
    [api],
  );

  const startRegistrationEmailOtp = useCallback(
    async (input: { sessionId: string; email: string }) => {
      const email = input.email.trim().toLowerCase();
      if (!api) {
        const sess = localOtpSessionsRef.current.get(input.sessionId);
        if (!sess) throw new Error("Unknown OTP session (local demo).");
        if (!sess.mobileVerified) throw new Error("Verify mobile OTP before requesting email OTP (local demo).");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("Enter a valid email.");
        }
        const demoEmailOtp = String(Math.floor(100000 + Math.random() * 900000));
        sess.emailNorm = email;
        sess.emailCode = demoEmailOtp;
        sess.emailVerified = false;
        return { demoEmailOtp };
      }
      return apiJson<{ demoEmailOtp: string }>("/api/customers/register-otp/start-email", {
        method: "POST",
        json: { sessionId: input.sessionId, email },
      });
    },
    [api],
  );

  const confirmRegistrationEmailOtp = useCallback(
    async (input: { sessionId: string; otp: string }) => {
      const otp = input.otp.trim();
      if (!api) {
        const sess = localOtpSessionsRef.current.get(input.sessionId);
        if (!sess) throw new Error("Unknown OTP session (local demo).");
        if (!sess.mobileVerified || !sess.emailCode) {
          throw new Error("Complete mobile verification and request email OTP first (local demo).");
        }
        if (otp !== sess.emailCode) throw new Error("Incorrect email OTP (local demo).");
        sess.emailVerified = true;
        return;
      }
      await apiJson<{ ok: boolean }>("/api/customers/register-otp/confirm-email", {
        method: "POST",
        json: { sessionId: input.sessionId, otp },
      });
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
            additionalAddresses: input.additionalAddresses,
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
      if (!w || !w.mobileVerified || !w.emailVerified || !w.emailNorm || w.emailCode == null) {
        throw new Error("Complete mobile and email OTP verification (local demo).");
      }
      const p10Otp = phoneLast10Local(input.otpPhone.trim() ? input.otpPhone : input.phone);
      if (w.phoneLast10 !== p10Otp) {
        throw new Error("Mobile for OTP does not match verification session (local demo).");
      }
      if (w.emailNorm !== input.email.trim().toLowerCase()) {
        throw new Error("Email does not match verification session (local demo).");
      }
      if (w.mobileCode !== input.mobileOtp.trim() || w.emailCode !== input.emailOtp.trim()) {
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
        additionalAddresses: input.additionalAddresses?.length ? input.additionalAddresses : undefined,
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
      startRegistrationMobileOtp,
      confirmRegistrationMobileOtp,
      startRegistrationEmailOtp,
      confirmRegistrationEmailOtp,
    }),
    [
      customers,
      lookup,
      getById,
      registerCustomer,
      startRegistrationMobileOtp,
      confirmRegistrationMobileOtp,
      startRegistrationEmailOtp,
      confirmRegistrationEmailOtp,
    ],
  );

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error("useCustomers must be used within CustomersProvider");
  return ctx;
}
