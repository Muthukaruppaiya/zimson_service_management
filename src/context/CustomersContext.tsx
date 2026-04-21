import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SEED_CUSTOMERS } from "../data/seedCustomers";
import { apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { lookupCustomer as runLookup, type LookupResult } from "../lib/customerLookup";
import { STORAGE_CUSTOMERS } from "../lib/storageKeys";
import type { CustomerKind, CustomerRecord } from "../types/customer";
import { useAuth } from "./AuthContext";

type CustomersContextValue = {
  customers: CustomerRecord[];
  lookup: (name: string, phone: string) => LookupResult;
  getById: (id: string) => CustomerRecord | undefined;
  registerCustomer: (input: {
    displayName: string;
    phone: string;
    email: string;
    address?: string;
    city?: string;
    customerKind: CustomerKind;
    company?: string;
    gst?: string;
    pan?: string;
  }) => Promise<CustomerRecord>;
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

export function CustomersProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [extra, setExtra] = useState<CustomerRecord[]>(() => (api ? [] : loadStoredCustomers()));

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    (async () => {
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

  const registerCustomer = useCallback(
    async (input: {
      displayName: string;
      phone: string;
      email: string;
      address?: string;
      city?: string;
      customerKind: CustomerKind;
      company?: string;
      gst?: string;
      pan?: string;
    }): Promise<CustomerRecord> => {
      if (api) {
        const data = await apiJson<{ customer: CustomerRecord }>("/api/customers", {
          method: "POST",
          json: {
            displayName: input.displayName.trim(),
            phone: input.phone.trim(),
            email: input.email.trim(),
            address: input.address?.trim(),
            city: input.city?.trim(),
            customerKind: input.customerKind,
            company: input.company?.trim(),
            gst: input.gst?.trim(),
            pan: input.pan?.trim(),
          },
        });
        setExtra((prev) => [...prev, data.customer]);
        return data.customer;
      }

      const row: CustomerRecord = {
        id: createId("cust"),
        displayName: input.displayName.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        address: input.address?.trim() || undefined,
        city: input.city?.trim() || undefined,
        customerKind: input.customerKind,
        company: input.company?.trim() || undefined,
        gst: input.gst?.trim().toUpperCase() || undefined,
        pan: input.pan?.trim().toUpperCase() || undefined,
        createdAt: new Date().toISOString(),
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
    }),
    [customers, lookup, getById, registerCustomer],
  );

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error("useCustomers must be used within CustomersProvider");
  return ctx;
}
