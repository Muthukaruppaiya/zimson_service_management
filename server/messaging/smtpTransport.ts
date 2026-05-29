import nodemailer from "nodemailer";
import { getMessagingConfig } from "./config";

let transporter: nodemailer.Transporter | null = null;

export function resetSmtpTransporter(): void {
  transporter = null;
}

export function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const cfg = getMessagingConfig().email;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });
  return transporter;
}
