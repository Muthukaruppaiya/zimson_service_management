# Zimson — SMS, Email & WhatsApp settings reference

This guide explains what to enter in **Settings → SMS, email & WhatsApp** (`/settings/messaging`).  
Only **Super Admin** can open or save this page. Values are stored in the database (not hardcoded in the app).

**Provider links**

| Channel | Provider | Documentation |
|--------|----------|----------------|
| SMS | Qikberry | https://apidocs.qikberry.ai/ |
| WhatsApp | Qikchat | https://qikchat.gitbook.io/apidocs |
| Email | Your mail host (e.g. Gmail SMTP) | From your IT / Google Workspace admin |

---

## 1. SMS (Qikberry)

Used for: customer registration OTP, handover OTP, booking OTP, and other mobile OTP flows.

| Field in app | Required | What to enter | Where you get it |
|--------------|----------|---------------|------------------|
| **SMS channel enabled** | Yes | Keep ON to send SMS; turn OFF to stop SMS (OTP may show on screen instead). | Your choice |
| **API URL** | Yes | `https://rest.qikberry.ai/v1/sms/messages` (default). Only change if Qikberry gives a different endpoint. | Qikberry dashboard / API docs |
| **Template ID** | Yes | Numeric ID of your **DLT-approved OTP template** on Qikberry. Example: `1707175871295951368` | Qikberry → Templates (approved template for OTP) |
| **Sender ID** | Yes | 6-character sender name registered on DLT. Example: `ZIMSON` | Qikberry → Senders / your DLT registration |
| **Service** | Yes | Service type code from Qikberry. Common value: `SI` (Service Implicit / transactional). | Qikberry account setup |
| **Access token** | Yes | Qikberry **API access token** only — paste **without** the word `Bearer`. The system adds `Bearer` automatically. | Qikberry → API keys / access token |
| **OTP message template** | Recommended | Text that matches your **DLT-approved** SMS template. Use `{{1}}` where the OTP digits go. Example below. | Same as DLT template text registered with TRAI |

**Example OTP message template**

```text
Dear Customer, Your One Time Password is {{1}}. Please use this code to complete your verification - ZIMSON
```

**Notes**

- Mobile numbers are sent as India format: `+91` + 10-digit number.
- Template ID and sender must be **approved** on DLT; otherwise Qikberry returns an error.
- If SMS is off or misconfigured, the app can show the OTP on screen (see section 5).
- Get credentials from your Qikberry account manager if anything is missing.

---

## 2. WhatsApp (Qikchat)

Used for: sending **invoice PDF** to the customer after Quick Bill / Store Billing (“Send invoice on WhatsApp”).

| Field in app | Required | What to enter | Where you get it |
|--------------|----------|---------------|------------------|
| **WhatsApp channel enabled** | Yes | Keep ON to send WhatsApp invoices. | Your choice |
| **API base URL** | Yes | `https://api.qikchat.in` (default). Change only if Qikchat gives another base URL. | Qikchat account / API docs |
| **Invoice template name** | Yes | Exact name of your **Meta-approved WhatsApp template** with a **document header**. Example: `invoice` | Qikchat / WhatsApp Business Manager → Message templates |
| **Template language** | Yes | Language code on the template. Examples: `en`, `en_US` | Same template details in Meta / Qikchat |
| **Invoice send mode** | Yes | **Template** (recommended) — for new customers / business-initiated messages. **Media** — only if the customer messaged you in the last 24 hours. | Your WhatsApp use case |
| **API key** | Yes | Qikchat **QIKCHAT-API-KEY** value. | Qikchat dashboard |
| **Public PDF base URL** | Yes* | Public **HTTPS** URL of your API server **without** trailing slash. Example: `https://api.zimson.in` or `https://xxxx.trycloudflare.com` | Production domain, or dev tunnel (see below) |
| **Dry run** | Optional | ON = save PDF on server only, **do not** call WhatsApp (for testing layout). OFF = real send. | Testing only |

\* For **local development**, you can leave this empty in settings and set in `.env` on the server PC:

```env
MESSAGING_AUTO_TUNNEL=true
MESSAGING_TUNNEL_PROVIDER=cloudflared
```

Restart the API after enabling. The tunnel URL is used automatically for PDF links.

### WhatsApp template requirements (template mode)

Your approved template (e.g. name `invoice`) should support:

1. **Header**: type **Document** (PDF).
2. **Body**: at least **two text variables** — the app sends:
   - Variable 1: **Customer name**
   - Variable 2: **Invoice number**

Example body text (Meta template):

```text
Hello {{1}}, please find your invoice {{2}} from Zimson. Thank you for your business.
```

The PDF file must be reachable at a **direct public HTTPS link** ending in `.pdf`. Qikchat downloads the file from:

`{Public PDF base URL}/api/messaging/public-invoice-pdf/{filename}.pdf`  
(Nginx must proxy `/api` to the Node server — not the React app HTML page.)

**Do not use** `localhost` or unstable free tunnels for production.

### SRF tracking template (`customer_link`)

For SRF status link messages, create template name `customer_link` in Meta/Qikchat with:

- `{{1}}` = customer name
- `{{2}}` = SRF number
- `{{3}}` = tracking URL

Suggested body:

```text
Hi {{1}}, your service request {{2}} has been registered with Zimson.
Track live status here: {{3}}
Thank you for choosing Zimson.
```

If your template name is different, set `QIKCHAT_TRACKING_TEMPLATE_NAME` in server `.env`.

### Invoice send modes

| Mode | When to use |
|------|-------------|
| **Template** | Default. Customer has not chatted in the last 24h; uses approved `invoice` template + PDF in header. |
| **Media** | Customer replied on WhatsApp within 24h; sends document without template. |

---

## 3. Work Drive (optional — WhatsApp PDF hosting)

Use only if you **cannot** expose a public HTTPS URL for invoice PDFs on your API server.

| Field in app | Required | What to enter | Where you get it |
|--------------|----------|---------------|------------------|
| **Use Work Drive for invoice PDFs** | No | ON only if Qikberry gave you Work Drive upload access. | Qikberry support |
| **Upload URL** | If Work Drive ON | `https://wkdrive.qikberry.io/api/v1/upload` (default) | Qikberry Work Drive API |
| **Work Drive token** | If Work Drive ON | **Separate** bearer token for Work Drive — **not** the SMS token and **not** the Qikchat key. | Qikberry support (“Work Drive API token”) |
| **Extra header name** | No | Only if Qikberry documentation asks for a custom header. | Qikberry |

**Recommendation:** Prefer **Public PDF base URL** (production API or cloudflared tunnel) instead of Work Drive when possible.

---

## 4. Email (SMTP) — same settings page

Used for: email OTP on customer registration (when configured).

| Field in app | Required | What to enter | Example |
|--------------|----------|---------------|---------|
| **Email channel enabled** | Yes | ON to send email OTP. | ON |
| **SMTP host** | Yes | Mail server hostname. | `smtp.gmail.com` |
| **SMTP port** | Yes | Usually `587` (TLS). | `587` |
| **Username** | Yes | Mailbox login email. | `noreply@zimsonwatchcare.com` |
| **Password** | Yes | App password (Gmail: 16-char app password, **no spaces**). | From Google Account → Security → App passwords |
| **From address** | Yes | What recipients see as sender. | `Zimson Watch Care <noreply@zimsonwatchcare.com>` |
| **OTP subject** | Yes | Email subject for OTP. | `Your Zimson verification code` |
| **OTP body** | Yes | Email body; use `{{otp}}` for the code. | See example below |

**Example OTP email body**

```text
Your one time password - OTP is {{otp}} to sign in to your Zimson account. Valid for 20 minutes. Do not share this code.

— Team Zimson
```

If email fails or is not configured, the **email OTP can appear on screen** while SMS may still send.

---

## 5. OTP on screen

| Setting | Meaning |
|---------|---------|
| **Auto** | Show OTP in the app when SMS or email is not configured or failed. |
| **Always show on screen** | Force OTP on screen even if SMS/email works (testing / backup). |
| **Never show on screen** | Never show OTP in UI (only delivery via SMS/email). |

---

## 6. Quick checklist before go-live

### SMS

- [ ] DLT template approved and **Template ID** copied into settings  
- [ ] **Sender ID** matches DLT (e.g. ZIMSON)  
- [ ] **Access token** saved (leave password field blank on later edits to keep existing token)  
- [ ] Test registration with a real 10-digit mobile number  

### WhatsApp

- [ ] Qikchat **API key** saved  
- [ ] Meta template name (e.g. `invoice`) and language match exactly  
- [ ] **Public PDF base URL** is HTTPS and reachable from the internet  
- [ ] Dry run **OFF** for production  
- [ ] Send a test invoice; confirm PDF opens in browser before relying on WhatsApp  

### Email

- [ ] Gmail / SMTP app password correct (no spaces)  
- [ ] `SMTP_USER` and **From** address use the **same domain**  
- [ ] SPF + DKIM + DMARC configured on that domain (see [EMAIL_DELIVERABILITY.md](./EMAIL_DELIVERABILITY.md))  
- [ ] Test: `node scripts/diagnose-smtp.mjs you@example.com`  
- [ ] For `@zimson.net`: IT allowlist + check quarantine if not in inbox  
- [ ] Test registration with a real email address  

---

## 7. Saving secrets safely

- On **first save**, paste full API keys and passwords.  
- On **later edits**, leave token/password fields **empty** to keep the existing saved value.  
- The screen shows hints like “(saved — leave blank to keep)”.  
- Do not share this document with filled-in live tokens; use placeholders in copies.

---

## 8. Support contacts

| Issue | Contact |
|-------|---------|
| SMS / DLT / template ID / sender | Qikberry support |
| WhatsApp template approval / Qikchat API | Qikchat / your WhatsApp Business provider |
| Public URL / server / tunnel | Your IT team hosting the Zimson API |
| App settings access | Zimson Super Admin user in ERP |

---

*Document version: matches Zimson Wireframe messaging settings (DB-backed). Path in app: **Settings → SMS, email & WhatsApp**.*
