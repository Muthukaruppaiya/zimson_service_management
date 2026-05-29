import crypto from "node:crypto";
import type nodemailer from "nodemailer";
import { getTransporter } from "./smtpTransport";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Encode URL for HTML href (keeps query string intact for email clients). */
function escapeHref(href: string): string {
  return href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Outlook + Gmail compatible CTA — link on the anchor, not only the table cell. */
function renderEmailButton(href: string, label: string): string {
  const safeHref = escapeHref(href);
  const safeLabel = escapeHtml(label);
  const safeHrefMso = href.replace(/"/g, "&quot;");
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
  <tr>
    <td align="left" bgcolor="#1B3A8F" style="border-radius:8px;background-color:#1B3A8F;mso-padding-alt:0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHrefMso}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" strokecolor="#C9A227" fillcolor="#1B3A8F">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${safeHref}" style="background-color:#1B3A8F;border:2px solid #C9A227;border-radius:8px;color:#ffffff;display:inline-block;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.25;mso-hide:all;padding:14px 28px;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;">${safeLabel}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

export function parseFromAddress(from: string): { name: string; email: string; formatted: string } {
  const trimmed = from.trim();
  const m = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    return { name: m[1]!.trim(), email: m[2]!.trim(), formatted: trimmed };
  }
  return {
    name: "Zimson Watch Care",
    email: trimmed,
    formatted: `Zimson Watch Care <${trimmed}>`,
  };
}

type TransactionalBodyBlock =
  | { type: "paragraph"; html: string }
  | { type: "otp"; code: string }
  | {
      type: "link";
      href: string;
      label: string;
      /** @deprecated URL is hidden in HTML; only used when showUrlFallback is true */
      hint?: string;
      /** Show raw URL under the button (default: hidden) */
      showUrlFallback?: boolean;
    };

type SendTransactionalEmailInput = {
  from: string;
  to: string;
  subject: string;
  /** Hidden preview line (inbox snippet). */
  preheader: string;
  /** Plain-text body (full URLs here — best for copy/paste). */
  text: string;
  blocks: TransactionalBodyBlock[];
  replyTo?: string;
};

function renderBlocks(blocks: TransactionalBodyBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "paragraph") {
        return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#27272a;">${b.html}</p>`;
      }
      if (b.type === "otp") {
        const code = escapeHtml(b.code);
        return `<p style="margin:0 0 8px;font-size:13px;color:#52525b;">Your verification code</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
  <tr>
    <td style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;padding:14px 22px;font-size:28px;font-weight:700;letter-spacing:0.2em;color:#1B3A8F;font-family:Consolas,Monaco,monospace;">${code}</td>
  </tr>
</table>`;
      }
      const button = renderEmailButton(b.href, b.label);
      if (!b.showUrlFallback) {
        return button;
      }
      const copyUrl = escapeHtml(b.hint ?? b.href);
      return `${button}
<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#52525b;">
  If the button does not open, copy and paste this into your browser:<br>
  <span style="word-break:break-all;color:#1B3A8F;">${copyUrl}</span>
</p>`;
    })
    .join("\n");
}

export function buildTransactionalHtml(subject: string, preheader: string, blocks: TransactionalBodyBlock[]): string {
  const body = renderBlocks(blocks);
  const safeSubject = escapeHtml(subject);
  const safePreheader = escapeHtml(preheader);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
          <tr>
            <td style="padding:28px 28px 8px;border-bottom:3px solid #C9A227;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#1B3A8F;">Zimson Watch Care</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px;">
              ${body}
              <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#71717a;border-top:1px solid #e4e4e7;padding-top:16px;">
                This is an automated message from Zimson Service Management. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-size:11px;color:#a1a1aa;text-align:center;">&copy; Zimson Watch Care</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<void> {
  const from = parseFromAddress(input.from);
  const html = buildTransactionalHtml(input.subject, input.preheader, input.blocks);

  const mail: nodemailer.SendMailOptions = {
    from: from.formatted,
    to: input.to,
    replyTo: input.replyTo ?? from.email,
    subject: input.subject,
    text: input.text,
    html,
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
      "X-Entity-Ref-ID": crypto.randomUUID(),
    },
  };

  await getTransporter().sendMail(mail);
}
