import {
  isEmailConfigured,
  isSmsConfigured,
  shouldExposeEmailOtpInUi,
  shouldExposeMobileOtpInUi,
} from "./config";
import { sendOtpEmail } from "./smtpEmail";
import { sendOtpSms } from "./qikberrySms";

export type OtpDeliveryTarget = { type: "mobile" | "email"; label: string };

/** Send the same OTP to each target. Throws if every channel fails and demo mode is off. */
export async function deliverOtpToTargets(code: string, targets: OtpDeliveryTarget[]): Promise<void> {
  const failures: string[] = [];
  let anySent = false;

  for (const target of targets) {
    if (target.type === "mobile") {
      if (!isSmsConfigured()) {
        if (!shouldExposeMobileOtpInUi()) failures.push("SMS not configured");
        continue;
      }
      try {
        await sendOtpSms(target.label, code);
        anySent = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "SMS failed";
        failures.push(msg);
        console.error("[otp-sms]", target.label, msg);
      }
      continue;
    }

    if (!isEmailConfigured()) {
      if (!shouldExposeEmailOtpInUi()) failures.push("Email not configured");
      continue;
    }
    try {
      await sendOtpEmail(target.label, code);
      anySent = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Email failed";
      failures.push(msg);
      console.error("[otp-email]", target.label, msg);
    }
  }

  const uiFallbackOk = targets.some((t) =>
    t.type === "mobile" ? shouldExposeMobileOtpInUi() : shouldExposeEmailOtpInUi(),
  );
  if (!anySent && !uiFallbackOk) {
    throw new Error(failures.join(" ") || "Could not send OTP on any channel.");
  }
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
