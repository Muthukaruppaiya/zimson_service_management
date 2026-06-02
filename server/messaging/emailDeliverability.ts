import crypto from "node:crypto";
import type nodemailer from "nodemailer";
import { getMessagingConfig } from "./config";
import { parseFromAddress } from "./transactionalEmail";

/** Domain used in Message-ID (should match the From / authenticated sending domain). */
export function emailMessageIdDomain(fromEmail: string, smtpUser: string): string {
  const fromDomain = fromEmail.includes("@") ? fromEmail.split("@")[1]!.toLowerCase() : "";
  const userDomain = smtpUser.includes("@") ? smtpUser.split("@")[1]!.toLowerCase() : "";
  return fromDomain || userDomain || "zimsonwatchcare.com";
}

/**
 * MAIL FROM envelope address — align with SMTP login so SPF/DKIM pass at receiving servers.
 * (Display "From" can still use a friendly name via parseFromAddress.)
 */
export function smtpEnvelopeFrom(fromEmail: string, smtpUser: string): string {
  const user = smtpUser.trim().toLowerCase();
  if (user.includes("@")) return user;
  return fromEmail.trim().toLowerCase();
}

export function buildDeliverabilityMailOptions(
  input: {
    fromFormatted: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    attachments?: nodemailer.SendMailOptions["attachments"];
  },
): nodemailer.SendMailOptions {
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(input.fromFormatted);
  const envelopeFrom = smtpEnvelopeFrom(from.email, cfg.user);
  const domain = emailMessageIdDomain(from.email, cfg.user);
  const replyTo =
    input.replyTo?.trim() ||
    process.env.SMTP_REPLY_TO?.trim() ||
    envelopeFrom;

  return {
    from: input.fromFormatted,
    to: input.to.trim(),
    replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
    envelope: {
      from: envelopeFrom,
      to: input.to.trim(),
    },
    messageId: `<${crypto.randomUUID()}@${domain}>`,
    headers: {
      "X-Mailer": "Zimson Service Management",
      "X-Entity-Ref-ID": crypto.randomUUID(),
      Precedence: "auto",
    },
  };
}
