# Email deliverability — inbox (not spam) and @zimson.net delivery

The app sends mail through **your SMTP server** (Settings → SMS, email & WhatsApp, or `SMTP_*` in `.env`).  
**The application cannot force “Inbox”** — that is decided by the recipient’s mail provider (Gmail, Microsoft 365, Zoho, etc.) using **DNS authentication** and reputation.

---

## Why mail goes to Spam / Junk

| Cause | What to do |
|--------|------------|
| **No SPF** on the sending domain | Add SPF DNS record for the domain in **From** / **SMTP username** |
| **No DKIM** | Enable DKIM in Google Workspace / Microsoft 365 / your SMTP host |
| **No DMARC** | Add `DMARC` DNS record (start with `p=none` for monitoring) |
| **From address ≠ SMTP login domain** | Use `SMTP_USER=noreply@yourdomain.com` and `SMTP_FROM=Zimson Watch Care <noreply@yourdomain.com>` on the **same domain** |
| **Sending via personal Gmail** but **From** shows another domain | Use Google Workspace on your real domain, or set From to the Gmail address |
| **New domain / low volume** | Warm up; ask users to mark “Not spam” once |
| **PDF attachments** (invoices) | Normal for invoices; good SPF/DKIM matters more |

---

## Recommended setup for Zimson (production)

### Option A — Google Workspace (best for `@zimson.net` and `@zimsonwatchcare.com`)

1. Use a mailbox on your real domain, e.g. `noreply@zimsonwatchcare.com` or `noreply@zimson.net`.
2. In Google Admin: enable **DKIM** for the domain; publish the TXT record in DNS.
3. Add **SPF** at DNS for that domain:
   ```text
   v=spf1 include:_spf.google.com ~all
   ```
4. Add **DMARC** (example):
   ```text
   v=DMARC1; p=none; rua=mailto:dmarc@zimsonwatchcare.com
   ```
5. In the app (or `.env`):
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=noreply@zimsonwatchcare.com
   SMTP_PASSWORD=<16-char app password>
   SMTP_FROM=Zimson Watch Care <noreply@zimsonwatchcare.com>
   SMTP_REPLY_TO=support@zimsonwatchcare.com
   ```
6. Restart API after changes: `npm run env:sync-smtp` then restart Node.

### Option B — Microsoft 365 (`@zimson.net` mailboxes)

1. Create `noreply@zimson.net` (or use an existing service account).
2. SMTP: `smtp.office365.com`, port `587`, authenticate with that mailbox.
3. Configure **SPF** (`include:spf.protection.outlook.com`) and **DKIM** in Microsoft 365 admin.
4. Set `SMTP_USER` and `SMTP_FROM` to the **same** `@zimson.net` address.

Using Gmail SMTP to send **as** `@zimson.net` without proper Workspace/alias setup will often **fail or land in spam** for `@zimson.net` recipients.

---

## Why `@zimson.net` addresses do not receive mail

Check these in order:

1. **App logs** (server console)  
   - `[smtp] … sent to user@zimson.net` → app handed off to SMTP successfully.  
   - `[TRACKING LINK] Email send failed` → fix SMTP credentials or From/domain alignment.

2. **Customer record**  
   - Email must be stored on the customer; otherwise: `No customer email on file.`

3. **Internal quarantine (very common for company domains)**  
   - IT must check **Quarantine / Spam** in Microsoft 365 or Google Admin for `user@zimson.net`.  
   - Ask IT to **allowlist**:
     - Envelope sender: your `SMTP_USER` address  
     - Display name: `Zimson Watch Care`  
     - Sending IP (if using fixed server SMTP)

4. **DNS / routing**  
   - Confirm `zimson.net` MX records accept mail from your SMTP provider.  
   - If `zimson.net` only accepts internal relay, external SMTP must be **authorized** in that server’s policy.

5. **Test outside Zimson**  
   - Send to a personal Gmail address. If Gmail receives but `@zimson.net` does not → **corporate filter**, not app bug.

---

## Test SMTP from the server

```bash
# From project root, with .env loaded:
node scripts/diagnose-smtp.mjs your.email@zimson.net
```

Then check inbox **and** spam. For `@zimson.net`, ask IT to trace the message ID from the script output.

---

## What the app already does

- HTML + plain-text bodies  
- Consistent branding  
- **Envelope sender** aligned with `SMTP_USER` (SPF-friendly)  
- **Message-ID** on your sending domain  
- Optional `SMTP_REPLY_TO` for replies (e.g. support desk)

---

## Quick checklist

- [ ] `SMTP_USER` and domain in `SMTP_FROM` match  
- [ ] SPF + DKIM + DMARC on that domain  
- [ ] App password (no spaces) for Gmail  
- [ ] `npm run env:sync-smtp` after `.env` change  
- [ ] API restarted  
- [ ] Test to Gmail + test to `@zimson.net` with IT checking quarantine  
- [ ] IT allowlist for production sending address  

For field names in the UI, see [MESSAGING_SETTINGS_REFERENCE.md](./MESSAGING_SETTINGS_REFERENCE.md).
