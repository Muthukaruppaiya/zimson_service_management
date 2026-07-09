import { otpLengthLabel } from "./otp";

export type OtpSentTarget = { type: "mobile" | "email"; label: string };

function maskMobile(label: string): string {
  const digits = label.replace(/\D/g, "");
  if (digits.length >= 4) return `•••• ${digits.slice(-4)}`;
  return label;
}

export function formatOtpSentSubtitle(targets: OtpSentTarget[]): string {
  if (!targets.length) return `Check SMS or email for your ${otpLengthLabel()} code.`;
  return targets
    .map((t) =>
      t.type === "mobile" ? `SMS sent to ${maskMobile(t.label)}` : `Email sent to ${t.label}`,
    )
    .join(" · ");
}

export function formatOtpSentSubtitlePhoneEmail(phone?: string, email?: string): string {
  const parts: string[] = [];
  const p = phone?.trim() ?? "";
  const e = email?.trim() ?? "";
  if (p) parts.push(`SMS sent to ${maskMobile(p)}`);
  if (e) parts.push(`Email sent to ${e}`);
  return parts.length ? parts.join(" · ") : `Check your device for your ${otpLengthLabel()} code.`;
}
