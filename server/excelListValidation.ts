import ExcelJS from "exceljs";

const DATA_ROWS = 2000;
const LISTS_SHEET = "Dropdowns";

export type ExcelDropdownRule = {
  sheetName: string;
  /** Exact header text in row 1 of the data sheet. */
  header: string;
  values: string[];
  allowBlank?: boolean;
  /**
   * Point the list at an existing sheet instead of the Dropdowns sheet,
   * e.g. "'Tax Types'!$A$2:$A$10".
   */
  sourceRange?: string;
};

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function listKey(values: string[]): string {
  return values.join("\u0001");
}

function findHeaderColumn(ws: ExcelJS.Worksheet, header: string): number {
  const want = header.trim().toLowerCase();
  let found = 0;
  ws.getRow(1).eachCell((cell, colNumber) => {
    if (found) return;
    if (String(cell.value ?? "").trim().toLowerCase() === want) found = colNumber;
  });
  return found;
}

/**
 * Adds Excel list dropdowns to a SheetJS-generated .xlsx buffer.
 * Allowed values are stored on a Dropdowns sheet (unless sourceRange is set).
 */
export async function withExcelDropdowns(buffer: Buffer, rules: ExcelDropdownRule[]): Promise<Buffer> {
  const usable = rules.filter((r) => r.sourceRange || r.values.length > 0);
  if (usable.length === 0) return buffer;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const uniqueLists = new Map<string, { col: number; start: number; end: number }>();
  const needsListsSheet = usable.some((r) => !r.sourceRange);
  if (needsListsSheet) {
    const existing = wb.getWorksheet(LISTS_SHEET);
    if (existing) wb.removeWorksheet(existing.id);
    const lists = wb.addWorksheet(LISTS_SHEET);
    let listCol = 1;
    for (const rule of usable) {
      if (rule.sourceRange) continue;
      const key = listKey(rule.values);
      if (uniqueLists.has(key)) continue;
      lists.getCell(1, listCol).value = rule.header;
      lists.getCell(1, listCol).font = { bold: true };
      rule.values.forEach((v, i) => {
        lists.getCell(i + 2, listCol).value = v;
      });
      uniqueLists.set(key, { col: listCol, start: 2, end: 1 + rule.values.length });
      listCol += 1;
    }
    lists.columns.forEach((col) => {
      col.width = 28;
    });
  }

  for (const rule of usable) {
    const ws = wb.getWorksheet(rule.sheetName);
    if (!ws) continue;
    const colIdx = findHeaderColumn(ws, rule.header);
    if (!colIdx) continue;

    let formula = rule.sourceRange ?? "";
    if (!formula) {
      const loc = uniqueLists.get(listKey(rule.values));
      if (!loc) continue;
      const letter = colLetter(loc.col);
      formula = `'${LISTS_SHEET}'!$${letter}$${loc.start}:$${letter}$${loc.end}`;
    }

    const letter = colLetter(colIdx);
    const preview = rule.values.slice(0, 8).join(" / ") + (rule.values.length > 8 ? " / …" : "");
    ws.dataValidations.add(`${letter}2:${letter}${DATA_ROWS}`, {
      type: "list",
      allowBlank: rule.allowBlank !== false,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Invalid value",
      error: preview
        ? `Select a value from the dropdown (${preview}).`
        : "Select a value from the dropdown.",
      showInputMessage: true,
      promptTitle: rule.header,
      prompt: preview || "Select from the list",
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export const EXCEL_YES_NO = ["Y", "N"] as const;
export const EXCEL_CUSTOMER_KINDS = ["B2C", "B2B"] as const;
export const EXCEL_SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."] as const;
export const EXCEL_TAX_PREFERENCES = ["with_tax", "without_tax_exhibited"] as const;
export const EXCEL_LOCATION_TYPES = ["HO", "STORE"] as const;
export const EXCEL_SPARE_CATEGORIES = [
  "Glass",
  "Movement",
  "Battery",
  "Crown",
  "Gasket",
  "Strap",
  "Dial",
  "Hands",
  "Lubricant",
  "Tool",
  "Consumable",
  "Stem",
  "Case Part",
  "Movement Part",
  "Bracelet",
  "Other",
] as const;
