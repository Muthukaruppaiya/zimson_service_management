import { openPrintDocument } from "./inventoryDocuments";
import type { SrfJob } from "../types/srfJob";

function base(title: string, body: string): string {
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  return `<!doctype html>
  <html>
    <head><meta charset="utf-8"/><title>${title}</title></head>
    <base href="${baseHref}/" />
    <body style="font-family:Arial,sans-serif;padding:24px;color:#111">
      ${body}
    </body>
  </html>`;
}

function qrBlock(reference: string): string {
  const q = encodeURIComponent(reference);
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${q}" alt="QR ${reference}" style="border:1px solid #111;padding:4px;background:#fff"/>
  </div>`;
}

function backendOrigin(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:4000`;
  }
  return origin;
}

function absolutePhotoSrc(filePath: string): string {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const clean = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return `${backendOrigin()}${clean}`;
}

export function printSrfDocument(job: {
  reference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  photos?: Array<{ id: string; photoKind?: string; filePath: string }>;
}): void {
  const photoBlocks = (job.photos ?? [])
    .map((p) => {
      const src = absolutePhotoSrc(p.filePath);
      return `<div style="width:160px">
        <img src="${src}" alt="${p.photoKind ?? "watch photo"}" style="width:160px;height:110px;object-fit:cover;border:1px solid #ccc;border-radius:6px"/>
        <div style="font-size:11px;margin-top:4px;text-transform:capitalize">${p.photoKind ?? "other"}</div>
      </div>`;
    })
    .join("");
  const html = base(
    `SRF ${job.reference}`,
    `${qrBlock(job.reference)}<h2 style="margin:0 0 12px">Service Request Form</h2>
     <div><strong>SRF:</strong> ${job.reference}</div>
     <div><strong>Customer:</strong> ${job.customerName} (${job.phone})</div>
     <div><strong>Watch:</strong> ${job.watchBrand} ${job.watchModel} · ${job.serial}</div>
     <div style="margin-top:8px"><strong>Complaint:</strong> ${job.complaint}</div>
     <div style="margin-top:8px"><strong>Estimate:</strong> INR ${job.estimateTotalInr.toFixed(2)}</div>
     <h3 style="margin:16px 0 6px">Watch images</h3>
     <div style="display:flex;flex-wrap:wrap;gap:8px">${photoBlocks || "<div>No images uploaded</div>"}</div>
     <div style="margin-top:24px">Customer Sign: _____________________</div>
     <div style="margin-top:16px">Store Sign: _____________________</div>`,
  );
  openPrintDocument(`SRF ${job.reference}`, html);
}

export function printFullSrfDocument(
  job: SrfJob,
  historyRows: Array<{ id: string; status: string; note: string; changedAt: string }> = [],
): void {
  const spareRows = (job.usedSpares ?? [])
    .map(
      (x, idx) =>
        `<tr>
          <td>${idx + 1}</td>
          <td>${x.name}</td>
          <td>${x.qty}</td>
          <td>INR ${Number(x.unitPriceInr ?? 0).toFixed(2)}</td>
          <td>INR ${Number(x.lineTotalInr ?? 0).toFixed(2)}</td>
        </tr>`,
    )
    .join("");
  const historyTableRows = historyRows
    .map(
      (h, idx) =>
        `<tr>
          <td>${idx + 1}</td>
          <td>${new Date(h.changedAt).toLocaleString()}</td>
          <td>${h.status.replace(/_/g, " ")}</td>
          <td>${h.note || "-"}</td>
        </tr>`,
    )
    .join("");
  const photoBlocks = (job.photos ?? [])
    .map((p) => {
      const src = absolutePhotoSrc(p.filePath);
      return `<div style="width:170px">
        <img src="${src}" alt="${p.photoKind ?? "watch photo"}" style="width:170px;height:120px;object-fit:cover;border:1px solid #ccc;border-radius:6px"/>
        <div style="font-size:11px;margin-top:4px;text-transform:capitalize">${p.photoKind ?? "other"}</div>
      </div>`;
    })
    .join("");
  const html = base(
    `SRF ${job.reference}`,
    `${qrBlock(job.reference)}
     <h2 style="margin:0 0 12px">Service Request Form - Full Lifecycle</h2>
     <h3 style="margin:12px 0 6px">Customer and watch details</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>SRF reference</strong></td><td>${job.reference}</td><td><strong>Status</strong></td><td>${job.status}</td></tr>
         <tr><td><strong>Customer</strong></td><td>${job.customerName}</td><td><strong>Phone</strong></td><td>${job.phone}</td></tr>
         <tr><td><strong>Watch</strong></td><td>${job.watchBrand} ${job.watchModel}</td><td><strong>Serial</strong></td><td>${job.serial}</td></tr>
         <tr><td><strong>Complaint</strong></td><td colspan="3">${job.complaint || "-"}</td></tr>
         <tr><td><strong>Estimate</strong></td><td>INR ${Number(job.estimateTotalInr ?? 0).toFixed(2)}</td><td><strong>Created at</strong></td><td>${new Date(job.createdAt).toLocaleString()}</td></tr>
       </tbody>
     </table>
     <h3 style="margin:16px 0 6px">Process references and movement</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>DC number</strong></td><td>${job.dcNumber || "-"}</td><td><strong>Dispatched to SC</strong></td><td>${job.dispatchedToScAt ? new Date(job.dispatchedToScAt).toLocaleString() : "-"}</td></tr>
         <tr><td><strong>SC inward</strong></td><td>${job.inwardAt ? new Date(job.inwardAt).toLocaleString() : "-"}</td><td><strong>Technician assigned</strong></td><td>${job.assignedTechnicianId || "-"}</td></tr>
         <tr><td><strong>ODC number</strong></td><td>${job.outwardDcNumber || "-"}</td><td><strong>Dispatched to store</strong></td><td>${job.dispatchedToStoreAt ? new Date(job.dispatchedToStoreAt).toLocaleString() : "-"}</td></tr>
         <tr><td><strong>Received at store</strong></td><td>${job.receivedBackAtStoreAt ? new Date(job.receivedBackAtStoreAt).toLocaleString() : "-"}</td><td><strong>Closed at</strong></td><td>${job.closedAt ? new Date(job.closedAt).toLocaleString() : "-"}</td></tr>
       </tbody>
     </table>
     <h3 style="margin:16px 0 6px">Technician and supervisor feedback trail</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Date time</th><th>Status</th><th>Feedback / note</th></tr></thead>
       <tbody>${historyTableRows || '<tr><td colspan="4">No history notes</td></tr>'}</tbody>
     </table>
     <h3 style="margin:16px 0 6px">Used spares details</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Spare</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
       <tbody>${spareRows || '<tr><td colspan="5">No spares entered</td></tr>'}</tbody>
     </table>
     <h3 style="margin:16px 0 6px">Watch images</h3>
     <div style="display:flex;flex-wrap:wrap;gap:8px">${photoBlocks || "<div>No images uploaded</div>"}</div>
     <div style="margin-top:12px"><strong>Spares slip submitted by:</strong> ${job.sparesSlipSubmittedBy || "-"} ${job.sparesSlipSubmittedAt ? `(${new Date(job.sparesSlipSubmittedAt).toLocaleString()})` : ""}</div>
     <div><strong>HO bill ref:</strong> ${job.hoSparesBillRef || "-"}</div>
     <div><strong>Store bill ref:</strong> ${job.storeBillRef || "-"}</div>
     <div style="margin-top:24px">Customer Sign: _____________________</div>
     <div style="margin-top:16px">Technician Sign: _____________________</div>
     <div style="margin-top:16px">Supervisor Sign: _____________________</div>
     <div style="margin-top:16px">Store Sign: _____________________</div>`,
  );
  openPrintDocument(`SRF ${job.reference}`, html);
}

export function printDcDocument(
  kind: "DC" | "ODC",
  number: string,
  jobs: SrfJob[],
  opts?: {
    fromLocation?: string;
    toLocation?: string;
    fromHo?: string;
    toHo?: string;
    hoInvoiceRef?: string;
    storeInvoiceRef?: string;
  },
): void {
  const rows = jobs
    .map(
      (j, idx) =>
        `<tr><td>${idx + 1}</td><td>${j.reference}</td><td>${j.customerName}</td><td>${j.watchBrand} ${j.watchModel}</td><td>${j.serial}</td></tr>`,
    )
    .join("");
  const first = jobs[0];
  const defaultFromLocation =
    kind === "DC"
      ? `Store: ${first?.storeName ?? first?.storeId ?? "-"}`
      : `HO / Service Centre: ${first?.regionName ?? first?.regionId ?? "-"}`;
  const defaultToLocation =
    kind === "DC"
      ? `HO / Service Centre: ${first?.regionName ?? first?.regionId ?? "-"}`
      : `Store: ${first?.destinationStoreId ?? first?.storeName ?? first?.storeId ?? "-"}`;
  const fromLocation = opts?.fromLocation ?? defaultFromLocation;
  const toLocation = opts?.toLocation ?? defaultToLocation;
  const fromHo = opts?.fromHo ?? (first?.regionName ?? first?.regionId ?? "-");
  const toHo = opts?.toHo ?? (first?.regionName ?? first?.regionId ?? "-");
  const hoInvoiceRef = opts?.hoInvoiceRef ?? first?.hoSparesBillRef ?? "-";
  const storeInvoiceRef = opts?.storeInvoiceRef ?? first?.storeBillRef ?? "-";

  const html = base(
    `${kind} ${number}`,
    `${qrBlock(number)}<h2 style="margin:0 0 12px">${kind} Document</h2>
     <div><strong>No:</strong> ${number}</div>
     <div><strong>From Location:</strong> ${fromLocation}</div>
     <div><strong>To Location:</strong> ${toLocation}</div>
     <div><strong>From HO:</strong> ${fromHo}</div>
     <div><strong>To HO:</strong> ${toHo}</div>
     <div><strong>HO -> HO Invoice Ref:</strong> ${hoInvoiceRef}</div>
     <div><strong>HO -> Store Invoice Ref:</strong> ${storeInvoiceRef}</div>
     <table style="width:100%;border-collapse:collapse;margin-top:12px" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>SRF</th><th>Customer</th><th>Watch</th><th>Serial</th></tr></thead>
       <tbody>${rows || '<tr><td colspan="5">No rows</td></tr>'}</tbody>
     </table>
     <div style="margin-top:24px">Prepared By: _____________________</div>
     <div style="margin-top:16px">Received By: _____________________</div>`,
  );
  openPrintDocument(`${kind} ${number}`, html);
}

export function printAssignmentSlip(job: SrfJob, technicianLabel: string): void {
  const html = base(
    `Assignment ${job.reference}`,
    `${qrBlock(job.reference)}<h2 style="margin:0 0 12px">Technician Assignment Slip</h2>
     <div><strong>SRF:</strong> ${job.reference}</div>
     <div><strong>Technician:</strong> ${technicianLabel}</div>
     <div><strong>Customer:</strong> ${job.customerName} (${job.phone})</div>
     <div><strong>Watch:</strong> ${job.watchBrand} ${job.watchModel} · ${job.serial}</div>
     <div style="margin-top:10px"><strong>Complaint:</strong> ${job.complaint || "-"}</div>
     <div style="margin-top:10px"><strong>Estimate:</strong> INR ${(job.estimateTotalInr ?? 0).toFixed(2)}</div>
     <div style="margin-top:20px">Technician Notes:</div>
     <div style="height:120px;border:1px solid #333;margin-top:8px"></div>`,
  );
  openPrintDocument(`Assignment ${job.reference}`, html);
}

export function printStoreServiceInvoice(
  job: SrfJob,
  payload: { paymentMode: string; paidAmountInr: number; otpCode: string; billedAt?: Date; hoSparesBillRef?: string; storeBillRef?: string },
): void {
  const billedAt = payload.billedAt ?? new Date();
  const spareRows = (job.usedSpares ?? [])
    .map((x, idx) => `<tr><td>${idx + 1}</td><td>${x.name}</td><td>${x.qty}</td></tr>`)
    .join("");
  const html = base(
    `Invoice ${job.reference}`,
    `${qrBlock(job.reference)}<h2 style="margin:0 0 12px">Service Handover Invoice</h2>
     <div><strong>SRF:</strong> ${job.reference}</div>
     <div><strong>Date:</strong> ${billedAt.toLocaleString()}</div>
     <div><strong>Customer:</strong> ${job.customerName} (${job.phone})</div>
     <div><strong>Watch:</strong> ${job.watchBrand} ${job.watchModel} · ${job.serial}</div>
     <div style="margin-top:10px"><strong>Service estimate:</strong> INR ${(job.estimateTotalInr ?? 0).toFixed(2)}</div>
     <div><strong>Paid amount:</strong> INR ${payload.paidAmountInr.toFixed(2)}</div>
     <div><strong>Payment mode:</strong> ${payload.paymentMode}</div>
     <div><strong>Collection OTP verified:</strong> ${payload.otpCode}</div>
     <div><strong>HO spare bill ref:</strong> ${payload.hoSparesBillRef || "-"}</div>
     <div><strong>Store bill ref:</strong> ${payload.storeBillRef || "-"}</div>
     <h3 style="margin:16px 0 8px">Used spares</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Spare</th><th>Qty</th></tr></thead>
       <tbody>${spareRows || '<tr><td colspan="3">No spares entered</td></tr>'}</tbody>
     </table>
     <div style="margin-top:24px">Customer Sign: _____________________</div>
     <div style="margin-top:16px">Store Sign: _____________________</div>`,
  );
  openPrintDocument(`Invoice ${job.reference}`, html);
}
