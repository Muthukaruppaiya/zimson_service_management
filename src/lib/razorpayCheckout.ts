import { apiJson, ApiError } from "./api";
import {
  razorpayAmountFromForm,
  razorpayRefLooksPaid,
  withRazorpayPaymentRef,
  type MultiPaymentFormState,
} from "./paymentModes";
import type { RazorpayCheckoutResult, RazorpayPublicConfig } from "../types/razorpaySettings";

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayCtor = new (options: RazorpayCheckoutOptions) => { open: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

function loadCheckoutScript(): Promise<RazorpayCtor> {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing && window.Razorpay) {
      resolve(window.Razorpay);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (!window.Razorpay) {
        reject(new Error("Razorpay checkout did not load."));
        return;
      }
      resolve(window.Razorpay);
    };
    script.onerror = () => reject(new Error("Could not load Razorpay checkout."));
    document.head.appendChild(script);
  });
}

export async function fetchRazorpayPublicConfig(): Promise<RazorpayPublicConfig> {
  return apiJson<RazorpayPublicConfig>("/api/payments/razorpay/config");
}

export async function openRazorpayCheckout(opts: {
  amountInr: number;
  purpose: "quick_bill" | "srf_advance" | "store_bill";
  name?: string;
  phone?: string;
  email?: string;
  description?: string;
}): Promise<RazorpayCheckoutResult> {
  const amountInr = Math.round(opts.amountInr * 100) / 100;
  if (!(amountInr >= 1)) {
    throw new Error("Razorpay amount must be at least ₹1.");
  }

  const cfg = await fetchRazorpayPublicConfig();
  if (!cfg.enabled || !cfg.keyId) {
    throw new Error("Razorpay is not enabled. Super admin can configure it under Settings → Razorpay.");
  }

  const order = await apiJson<{ orderId: string; amountPaise: number; currency: string; keyId: string }>(
    "/api/payments/razorpay/order",
    {
      method: "POST",
      json: {
        amountInr,
        purpose: opts.purpose,
        customerName: opts.name?.trim() || undefined,
        customerPhone: opts.phone?.trim() || undefined,
        customerEmail: opts.email?.trim() || undefined,
      },
    },
  );

  const Razorpay = await loadCheckoutScript();

  const checkout = await new Promise<RazorpayCheckoutResult>((resolve, reject) => {
    let settled = false;
    const rzp = new Razorpay({
      key: order.keyId || cfg.keyId,
      amount: order.amountPaise,
      currency: order.currency || "INR",
      name: "Zimson Watch Care",
      description: opts.description || "Service payment",
      order_id: order.orderId,
      prefill: {
        name: opts.name?.trim() || undefined,
        email: opts.email?.trim() || undefined,
        contact: opts.phone?.trim() || undefined,
      },
      theme: { color: "#0f3d2e" },
      handler: (response) => {
        settled = true;
        resolve({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new Error("Razorpay checkout was closed before payment completed."));
        },
      },
    });
    rzp.open();
  });

  await apiJson<{ ok: boolean }>("/api/payments/razorpay/verify", {
    method: "POST",
    json: checkout,
  });

  return checkout;
}

export async function collectRazorpayIfNeeded(opts: {
  form: MultiPaymentFormState;
  purpose: "quick_bill" | "srf_advance" | "store_bill";
  name?: string;
  phone?: string;
  email?: string;
  description?: string;
}): Promise<
  | { ok: true; form: MultiPaymentFormState; razorpay?: RazorpayCheckoutResult }
  | { ok: false; error: string }
> {
  const amountInr = razorpayAmountFromForm(opts.form);
  if (amountInr <= 0) return { ok: true, form: opts.form };
  if (razorpayRefLooksPaid(opts.form.Razorpay?.reference)) {
    return { ok: true, form: opts.form };
  }
  try {
    const razorpay = await openRazorpayCheckout({
      amountInr,
      purpose: opts.purpose,
      name: opts.name,
      phone: opts.phone,
      email: opts.email,
      description: opts.description,
    });
    return {
      ok: true,
      form: withRazorpayPaymentRef(opts.form, razorpay.paymentId),
      razorpay,
    };
  } catch (e) {
    const msg =
      e instanceof ApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Razorpay payment failed.";
    return { ok: false, error: msg };
  }
}
