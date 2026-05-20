import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/service/ServiceInvoiceTemplate.tsx";
let s = readFileSync(path, "utf8");

if (!s.includes("normalizeTermLine")) {
  s = s.replace(
    "  return `${mode} Amount`;\n}\n\nexport function ServiceInvoiceTemplate",
    `  return \`\${mode} Amount\`;\n}\n\nfunction normalizeTermLine(text: string): string {\n  return text.replace(/^\\s*\\d+[\\).\\]:-]+\\s*/, "").trim();\n}\n\nexport function ServiceInvoiceTemplate`,
  );
}

s = s.replace(
  'className="service-invoice-print-root mx-auto max-w-[210mm] bg-white text-sm text-stone-900 shadow-sm print:mx-0 print:max-w-none print:text-[9.5pt] print:leading-snug print:shadow-none"',
  'className="service-invoice-print-root inv-doc"',
);

const banner = `
        <div className="inv-banner">
          <motionless className="inv-banner-title">{data.documentLabel?.trim() || "TAX INVOICE"}</div>
          <div className="inv-banner-sub">
            <div>{data.invoiceType || "Tax Invoice"}</div>
            {data.placeOfSupply ? <div>Place of supply: {data.placeOfSupply}</div> : null}
          </div>
        </div>
`;

s = s.replace(
  '<div className="border border-stone-400 print:border-stone-600">',
  `<div className="inv-sheet">${banner}`,
);

s = s.replace(
  '<table className="w-full border-collapse text-xs print:text-[8pt]">',
  '<table className="inv-items-table">',
);

s = s.replace(
  '<div className="grid grid-cols-2 border-b border-stone-400 print:border-stone-400">',
  '<div className="inv-party-grid">',
);

s = s.replace(
  '<p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">\n              Store\n            </p>',
  '<div className="inv-section-head">Bill From (Seller)</div>',
);

s = s.replace(
  '<p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">\n              Customer\n            </p>',
  '<div className="inv-section-head">Bill To (Customer)</div>',
);

s = s.replace(
  '<div className="border-r border-stone-300 px-4 py-3 print:px-3 print:py-2">',
  '<div className="inv-party-col"><div className="inv-party-body">',
);

s = s.replace(
  '{/* Customer — right (label: value format — all fields always shown) */}\n          <div className="px-4 py-3 print:px-3 print:py-2">',
  '<div className="inv-party-col"><div className="inv-party-body">',
);

s = s.replace(
  `<motionless className="flex justify-between gap-4 border-t border-stone-400 pt-1 font-bold text-sm print:text-[9pt]">
                <span className="text-stone-900">Net Payable</span>
                <span className="tabular-nums text-stone-950">₹ {fmt(data.netPayable ?? data.totalAmount)}</span>
              </div>`,
  `<div className="inv-net-box">
                <span>Net Payable</span>
                <span>₹ {fmt(data.netPayable ?? data.totalAmount)}</span>
              </div>`,
);

s = s.replace(
  "{data.footerTerms.map((t, i) => (\n                <li key={i}>{t}</li>\n              ))}",
  "{data.footerTerms.map((t, i) => (\n                <li key={i}>{normalizeTermLine(t)}</li>\n              ))}",
);

s = s.replace(/<\/?motionless\b/g, (m) => m.replace("motionless", "motionless"));
s = s.replace(/motionless/g, "div");

writeFileSync(path, s);
console.log("Patched", path);
