import {
  isEmailConfigured,
  isSmsConfigured,
  shouldExposeEmailOtpInUi,
  shouldExposeMobileOtpInUi,
} from "./config";
import { sendOtpEmail } from "./smtpEmail";
import { sendOtpSms } from "./qikberrySms";

export type OtpDeliveryTarget = { type: "mobile" | "email"; label: string };

export type OtpDeliveryStatus = "sent" | "failed" | "not_configured";

export type OtpDeliveryResult = OtpDeliveryTarget & { status: OtpDeliveryStatus; error?: string };

/** Send the same OTP to each target and report the outcome per target. Never throws. */
export async function deliverOtpToTargetsDetailed(
  code: string,
  targets: OtpDeliveryTarget[],
): Promise<OtpDeliveryResult[]> {
  const results: OtpDeliveryResult[] = [];

  for (const target of targets) {
    if (target.type === "mobile") {
      if (!isSmsConfigured()) {
        results.push({ ...target, status: "not_configured", error: "SMS not configured" });
        continue;
      }
      try {
        await sendOtpSms(target.label, code);
        results.push({ ...target, status: "sent" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "SMS failed";
        results.push({ ...target, status: "failed", error: msg });
        console.error("[otp-sms]", target.label, msg);
      }
      continue;
    }

    if (!isEmailConfigured()) {
      results.push({ ...target, status: "not_configured", error: "Email not configured" });
      continue;
    }
    try {
      await sendOtpEmail(target.label, code);
      results.push({ ...target, status: "sent" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Email failed";
      results.push({ ...target, status: "failed", error: msg });
      console.error("[otp-email]", target.label, msg);
    }
  }

  return results;
}

/** Send the same OTP to each target. Throws if every channel fails and demo mode is off. */
export async function deliverOtpToTargets(code: string, targets: OtpDeliveryTarget[]): Promise<OtpDeliveryResult[]> {
  const results = await deliverOtpToTargetsDetailed(code, targets);
  const anySent = results.some((r) => r.status === "sent");
  const uiFallbackOk = targets.some((t) =>
    t.type === "mobile" ? shouldExposeMobileOtpInUi() : shouldExposeEmailOtpInUi(),
  );
  if (!anySent && !uiFallbackOk) {
    const failures = results
      .filter((r) => r.status !== "sent")
      .filter((r) => r.status === "failed" || !(r.type === "mobile" ? shouldExposeMobileOtpInUi() : shouldExposeEmailOtpInUi()))
      .map((r) => r.error ?? "");
    throw new Error(failures.join(" ").trim() || "Could not send OTP on any channel.");
  }
  return results;
}

export function otpStartResponsePayload(sessionId: string, code: string, targets: OtpDeliveryTarget[]) {
  const base = { sessionId, sentTo: targets } as {
    sessionId: string;
    sentTo: OtpDeliveryTarget[];
    demoOtp?: string;
    demoMobileOtp?: string;
    demoEmailOtp?: string;
  };
  const exposeOnUi = targets.some((t) =>
    t.type === "mobile" ? shouldExposeMobileOtpInUi() : shouldExposeEmailOtpInUi(),
  );
  if (exposeOnUi) base.demoOtp = code;
  return base;
}

export function registerMobileOtpResponse(sessionId: string, code: string) {
  const base = { sessionId } as { sessionId: string; demoMobileOtp?: string };
  if (shouldExposeMobileOtpInUi()) base.demoMobileOtp = code;
  return base;
}

/** When email was not delivered, include OTP for on-screen entry (SMTP off or send failed). */
export function registerEmailOtpResponse(code: string, emailDelivered: boolean) {
  const base = { emailDelivered } as { emailDelivered: boolean; demoEmailOtp?: string };
  if (!emailDelivered) base.demoEmailOtp = code;
  return base;
}

/** Try SMTP once; never throws — caller decides UI fallback from `sent`. */
export async function tryDeliverEmailOtp(code: string, email: string): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) return { sent: false };
  try {
    await sendOtpEmail(email, code);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email failed";
    console.error("[otp-email]", email, msg);
    return { sent: false };
  }
}
