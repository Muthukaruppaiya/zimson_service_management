/** OTP length for SMS, email, and handover verification flows. */
export const OTP_LENGTH = 4;

export function generateOtpCode(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export function isValidOtpCode(code: string): boolean {
  const t = code.trim();
  return t.length === OTP_LENGTH && /^\d+$/.test(t);
}
