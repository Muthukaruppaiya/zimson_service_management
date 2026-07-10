import { Link } from "react-router-dom";
import type { QuickBillEdocInfo, QuickBillInvoice } from "../../types/quickBill";
import { QuickBillEinvoiceActions } from "./QuickBillEinvoicePanel";
import { SendInvoiceEmailButton } from "./SendInvoiceEmailButton";
import { SendInvoiceWhatsAppButton } from "./SendInvoiceWhatsAppButton";
import {
  IconEmail,
  IconHome,
  IconPrint,
  IconSpinner,
  IconViewBelow,
  invoicePreviewIconBtn,
} from "./invoicePreviewIcons";

const iconPrimary = `${invoicePreviewIconBtn} bg-rlx-green-deep text-rlx-gold transition hover:bg-rlx-green`;
const iconEmail = `${invoicePreviewIconBtn} border border-sky-300/80 bg-sky-700 text-white transition hover:bg-sky-800`;
const iconWhatsApp = `${invoicePreviewIconBtn} border border-emerald-300/80 bg-emerald-600 text-white transition hover:bg-emerald-700`;
const iconEinvoice = `${invoicePreviewIconBtn} border border-rlx-green-deep/35 bg-rlx-green-deep text-rlx-gold transition hover:bg-rlx-green disabled:opacity-50`;
const iconNeutral = `${invoicePreviewIconBtn} border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-50`;

type Props = {
  invoice?: QuickBillInvoice;
  edoc?: QuickBillEdocInfo | null;
  customerName: string;
  email: string;
  phone: string;
  invoiceNumber: string;
  totalInr?: number;
  onPrint: () => void;
  onViewBelow: () => void;
  onPostActionNote?: (msg: string) => void;
  edocRetryBusy?: boolean;
  onRetryEinvoice?: () => void;
  showEinvoice?: boolean;
  homeTo?: string;
};

export function QuickBillSuccessIconActions({
  invoice,
  edoc,
  customerName,
  email,
  phone,
  invoiceNumber,
  totalInr,
  onPrint,
  onViewBelow,
  onPostActionNote,
  edocRetryBusy,
  onRetryEinvoice,
  showEinvoice = false,
  homeTo = "/service",
}: Props) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={onPrint}
        className={iconPrimary}
        aria-label="Print invoice"
        title="Print invoice"
      >
        <IconPrint />
      </button>

      <SendInvoiceEmailButton
        email={email}
        customerName={customerName}
        invoiceNumber={invoiceNumber}
        totalInr={totalInr}
        label="Send invoice by email"
        busyLabel="Sending email…"
        iconOnly
        className={iconEmail}
        onResult={(msg) => onPostActionNote?.(msg)}
      />

      <SendInvoiceWhatsAppButton
        phone={phone}
        customerName={customerName}
        invoiceNumber={invoiceNumber}
        label="Send invoice on WhatsApp"
        busyLabel="Sending on WhatsApp…"
        iconOnly
        className={iconWhatsApp}
        onResult={(msg) => onPostActionNote?.(msg)}
      />

      {showEinvoice ? (
        <QuickBillEinvoiceActions
          edoc={edoc}
          storedIrn={invoice?.edocIrn}
          storedPdfUrl={invoice?.edocPdfUrl}
          actionBtnClass={iconEinvoice}
          generating={edocRetryBusy}
          onGenerate={onRetryEinvoice}
          iconOnly
        />
      ) : null}

      <Link
        to={homeTo}
        className={`${iconNeutral} no-underline`}
        aria-label="Home"
        title="Home"
      >
        <IconHome />
      </Link>

      <button
        type="button"
        onClick={onViewBelow}
        className={iconNeutral}
        aria-label="View invoice below"
        title="View invoice below"
      >
        <IconViewBelow />
      </button>
    </div>
  );
}

export function QuickBillSuccessIconActionsDemo({
  onPrint,
  onViewBelow,
  onSendEmail,
  emailSending,
  emailDisabled,
  homeTo = "/service",
}: {
  onPrint: () => void;
  onViewBelow: () => void;
  onSendEmail: () => void;
  emailSending: boolean;
  emailDisabled: boolean;
  homeTo?: string;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={onPrint} className={iconPrimary} aria-label="Print invoice" title="Print invoice">
        <IconPrint />
      </button>
      <button
        type="button"
        disabled={emailDisabled || emailSending}
        onClick={onSendEmail}
        className={iconEmail}
        aria-label="Send invoice by email"
        title="Send invoice by email"
      >
        {emailSending ? <IconSpinner /> : <IconEmail />}
      </button>
      <Link to={homeTo} className={`${iconNeutral} no-underline`} aria-label="Home" title="Home">
        <IconHome />
      </Link>
      <button
        type="button"
        onClick={onViewBelow}
        className={iconNeutral}
        aria-label="View invoice below"
        title="View invoice below"
      >
        <IconViewBelow />
      </button>
    </div>
  );
}
