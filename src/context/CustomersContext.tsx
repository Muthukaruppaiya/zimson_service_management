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
import { generateOtpCode } from "../lib/otp";
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

type HandoverOtpTarget = { type: "mobile" | "email"; label: string };

type LocalHandoverOtpSession = {
  code: string;
  targets: HandoverOtpTarget[];
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
    demoMobileOtp?: string;
  }>;
  confirmRegistrationMobileOtp: (input: { sessionId: string; otp: string }) => Promise<void>;
  startRegistrationEmailOtp: (input: {
    sessionId: string;
    email: string;
  }) => Promise<{ demoEmailOtp?: string; emailDelivered?: boolean }>;
  confirmRegistrationEmailOtp: (input: { sessionId: string; otp: string }) => Promise<void>;
  startHandoverOtp: (input: { channel: "mobile" | "email"; phone?: string; email?: string }) => Promise<{
    sessionId: string;
    demoOtp?: string;
    sentTo: HandoverOtpTarget[];
  }>;
  startHandoverOtpBoth: (input: { phone?: string; email?: string }) => Promise<{
    sessionId: string;
    demoOtp?: string;
    sentTo: HandoverOtpTarget[];
  }>;
  confirmHandoverOtp: (input: { sessionId: string; otp: string }) => Promise<void>;
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

function optTrim(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function buildDisplayName(input: CustomerRegistrationPayload): string {
  if (input.customerKind === "B2B") {
    return optTrim(input.b2bTradeDisplayName);
  }
  return [input.salutation, input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

export function CustomersProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [extra, setExtra] = useState<CustomerRecord[]>(() => (api ? [] : loadStoredCustomers()));
  const localOtpSessionsRef = useRef(new Map<string, LocalRegOtpSession>());
  const localHandoverOtpSessionsRef = useRef(new Map<string, LocalHandoverOtpSession>());

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ customers: CustomerRecord[] }>("/api/customers");
        if (!cancelled) {
          const ids = new Set(SEED_CUSTOMERS.map((c) => c.id));
          const fromServer = data.customers.filter((c) => !ids.has(c.id));
          setExtra((prev) => {
            const byId = new Map<string, CustomerRecord>();
            for (const c of fromServer) byId.set(c.id, c);
            for (const c of prev) {
              if (ids.has(c.id)) continue;
              if (!byId.has(c.id)) byId.set(c.id, c);
            }
            return Array.from(byId.values());
          });
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
      const phoneTaken = customers.some((c) => phoneLast10Local(c.phone) === primaryP10);
      if (phoneTaken) {
        throw new Error(
          "This mobile number is already registered. Open Customer master to view or edit the existing profile.",
        );
      }
      if (!api) {
        const sessionId = `local-${createId("sess")}`;
        const demoMobileOtp = generateOtpCode();
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
      return apiJson<{ sessionId: string; demoMobileOtp?: string }>("/api/customers/register-otp/start-mobile", {
        method: "POST",
        json: {
          primaryPhone: input.primaryPhone.trim(),
          otpPhone: input.otpPhone.trim(),
        },
      });
    },
    [api, customers],
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
        const demoEmailOtp = generateOtpCode();
        sess.emailNorm = email;
        sess.emailCode = demoEmailOtp;
        sess.emailVerified = false;
        return { demoEmailOtp, emailDelivered: false };
      }
      return apiJson<{ demoEmailOtp?: string; emailDelivered?: boolean }>(
        "/api/customers/register-otp/start-email",
        {
          method: "POST",
          json: { sessionId: input.sessionId, email },
        },
      );
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

  const startHandoverOtp = useCallback(
    async (input: { channel: "mobile" | "email"; phone?: string; email?: string }) => {
      if (input.channel === "mobile") {
        const p10 = phoneLast10Local(String(input.phone ?? ""));
        if (p10.length !== 10) throw new Error("Enter a valid 10-digit mobile for OTP.");
        if (!api) {
          const sessionId = `handover-${createId("sess")}`;
          const demoOtp = generateOtpCode();
          const targets: HandoverOtpTarget[] = [{ type: "mobile", label: p10 }];
          localHandoverOtpSessionsRef.current.set(sessionId, { code: demoOtp, targets });
          return { sessionId, demoOtp, sentTo: targets };
        }
        return apiJson<{ sessionId: string; demoOtp: string; sentTo: HandoverOtpTarget[] }>(
          "/api/customers/handover-otp/start",
          { method: "POST", json: { channel: "mobile", phone: input.phone } },
        );
      }
      const email = String(input.email ?? "")
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email for OTP.");
      }
      if (!api) {
        const sessionId = `handover-${createId("sess")}`;
        const demoOtp = generateOtpCode();
        const targets: HandoverOtpTarget[] = [{ type: "email", label: email }];
        localHandoverOtpSessionsRef.current.set(sessionId, { code: demoOtp, targets });
        return { sessionId, demoOtp, sentTo: targets };
      }
      return apiJson<{ sessionId: string; demoOtp: string; sentTo: HandoverOtpTarget[] }>(
        "/api/customers/handover-otp/start",
        { method: "POST", json: { channel: "email", email } },
      );
    },
    [api],
  );

  const startHandoverOtpBoth = useCallback(
    async (input: { phone?: string; email?: string }) => {
      const targets: HandoverOtpTarget[] = [];
      const p10 = phoneLast10Local(String(input.phone ?? ""));
      if (p10.length === 10) targets.push({ type: "mobile", label: p10 });
      const email = String(input.email ?? "")
        .trim()
        .toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        targets.push({ type: "email", label: email });
      }
      if (targets.length === 0) {
        throw new Error("Provide a valid mobile and/or email for OTP.");
      }
      if (!api) {
        const sessionId = `handover-${createId("sess")}`;
        const demoOtp = generateOtpCode();
        localHandoverOtpSessionsRef.current.set(sessionId, { code: demoOtp, targets });
        return { sessionId, demoOtp, sentTo: targets };
      }
      return apiJson<{ sessionId: string; demoOtp: string; sentTo: HandoverOtpTarget[] }>(
        "/api/customers/handover-otp/start-both",
        { method: "POST", json: { phone: input.phone, email: input.email } },
      );
    },
    [api],
  );

  const confirmHandoverOtp = useCallback(
    async (input: { sessionId: string; otp: string }) => {
      const otp = input.otp.trim();
      if (!api) {
        const sess = localHandoverOtpSessionsRef.current.get(input.sessionId);
        if (!sess) throw new Error("Unknown OTP session (local demo).");
        if (otp !== sess.code) throw new Error("Incorrect OTP (local demo).");
        localHandoverOtpSessionsRef.current.delete(input.sessionId);
        return;
      }
      await apiJson<{ ok: boolean }>("/api/customers/handover-otp/confirm", {
        method: "POST",
        json: { sessionId: input.sessionId, otp },
      });
    },
    [api],
  );

  const registerCustomer = useCallback(
    async (input: CustomerRegistrationPayload): Promise<CustomerRecord> => {
      const regP10 = phoneLast10Local(optTrim(input.phone));
      if (regP10.length === 10 && customers.some((c) => phoneLast10Local(c.phone) === regP10)) {
        throw new Error(
          "This mobile number is already registered. Open Customer master to view or edit the existing profile.",
        );
      }
      if (api) {
        const data = await apiJson<{ customer: CustomerRecord }>("/api/customers", {
          method: "POST",
          json: {
            sessionId: input.sessionId,
            mobileOtp: optTrim(input.mobileOtp),
            emailOtp: optTrim(input.emailOtp),
            customerKind: input.customerKind,
            salutation: optTrim(input.salutation),
            firstName: optTrim(input.firstName),
            lastName: optTrim(input.lastName),
            phone: optTrim(input.phone),
            otpPhone: optTrim(input.otpPhone),
            alternatePhone: optTrim(input.alternatePhone) || undefined,
            telephone: optTrim(input.telephone) || undefined,
            email: optTrim(input.email) || undefined,
            dob: optTrim(input.dob) || null,
            anniversaryDate: optTrim(input.anniversaryDate) || null,
            billingAddress: input.billingAddress,
            shippingAddress: input.shippingAddress,
            sameShippingAsBilling: input.sameShippingAsBilling,
            additionalAddresses: input.additionalAddresses,
            b2bTradeDisplayName: optTrim(input.b2bTradeDisplayName) || undefined,
            taxPreference: input.taxPreference,
            company: optTrim(input.company) || undefined,
            gst: optTrim(input.gst) || undefined,
            pan: optTrim(input.pan) || undefined,
            remarkAttention: optTrim(input.remarkAttention) || undefined,
            referenceName: optTrim(input.referenceName) || undefined,
            representativeName: optTrim(input.representativeName) || undefined,
          },
        });
        setExtra((prev) => [...prev, data.customer]);
        return data.customer;
      }

      const w = localOtpSessionsRef.current.get(input.sessionId);
      const emailNorm = optTrim(input.email).toLowerCase();
      if (!w || !w.mobileVerified) {
        throw new Error("Complete mobile OTP verification (local demo).");
      }
      const emailOtp = optTrim(input.emailOtp);
      if (emailNorm && emailOtp && (!w.emailVerified || !w.emailNorm || w.emailCode == null)) {
        throw new Error("Complete email OTP verification or clear the email field (local demo).");
      }
      const p10Otp = phoneLast10Local(optTrim(input.otpPhone) || optTrim(input.phone));
      if (w.phoneLast10 !== p10Otp) {
        throw new Error("Mobile for OTP does not match verification session (local demo).");
      }
      if (emailNorm && emailOtp && w.emailNorm !== emailNorm) {
        throw new Error("Email does not match verification session (local demo).");
      }
      if (w.mobileCode !== optTrim(input.mobileOtp)) {
        throw new Error("Incorrect mobile OTP (local demo).");
      }
      if (emailNorm && emailOtp && w.emailCode !== emailOtp) {
        throw new Error("Incorrect email OTP (local demo).");
      }
      localOtpSessionsRef.current.delete(input.sessionId);

      const now = new Date().toISOString();
      const row: CustomerRecord = {
        id: createId("cust"),
        customerCode: `CUST-L-${Date.now().toString(36).toUpperCase().slice(-8)}`,
        displayName: buildDisplayName(input),
        salutation: optTrim(input.salutation) || undefined,
        firstName: optTrim(input.firstName) || undefined,
        lastName: optTrim(input.lastName) || undefined,
        phone: optTrim(input.phone),
        otpPhone: optTrim(input.otpPhone) || null,
        alternatePhone: optTrim(input.alternatePhone) || undefined,
        telephone: optTrim(input.telephone) || null,
        email: optTrim(input.email),
        dob: optTrim(input.dob) || null,
        anniversaryDate: optTrim(input.anniversaryDate) || null,
        address: undefined,
        city: `${optTrim(input.billingAddress.city)}, ${optTrim(input.billingAddress.district)}`.slice(0, 120),
        billingAddress: input.billingAddress,
        shippingAddress: input.sameShippingAsBilling ? input.billingAddress : input.shippingAddress,
        additionalAddresses: input.additionalAddresses?.length ? input.additionalAddresses : undefined,
        customerKind: input.customerKind,
        company: optTrim(input.company) || undefined,
        gst: optTrim(input.gst).toUpperCase() || undefined,
        pan: optTrim(input.pan).toUpperCase() || undefined,
        taxPreference: input.customerKind === "B2B" ? input.taxPreference ?? "with_tax" : null,
        b2bTradeDisplayName: input.customerKind === "B2B" ? optTrim(input.b2bTradeDisplayName) || null : null,
        remarkAttention: optTrim(input.remarkAttention) || null,
        referenceName: optTrim(input.referenceName) || null,
        representativeName: optTrim(input.representativeName) || null,
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
    [api, customers, extra],
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
      startHandoverOtp,
      startHandoverOtpBoth,
      confirmHandoverOtp,
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
      startHandoverOtp,
      startHandoverOtpBoth,
      confirmHandoverOtp,
    ],
  );

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error("useCustomers must be used within CustomersProvider");
  return ctx;
}
