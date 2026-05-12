const BELOW_20 = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function capitalizeWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function hundredsToWords(n: number): string {
  if (n < 20) return BELOW_20[n] ?? "";
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} ${BELOW_20[o]}` : TENS[t] ?? "";
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = `${BELOW_20[h]} hundred`;
  if (!rest) return head;
  return `${head} ${hundredsToWords(rest)}`;
}

function below1000ToWords(n: number): string {
  if (n < 100) return hundredsToWords(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = `${BELOW_20[h]} hundred`;
  if (!rest) return head;
  return `${head} ${hundredsToWords(rest)}`;
}

function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "zero";
  if (n < 1000) return below1000ToWords(n);

  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const remainder = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${below1000ToWords(crore)} crore`);
  if (lakh) parts.push(`${below1000ToWords(lakh)} lakh`);
  if (thousand) parts.push(`${below1000ToWords(thousand)} thousand`);
  if (remainder) parts.push(below1000ToWords(remainder));
  return parts.join(" ").trim();
}

/** English words for INR amount (rupees + paise), suitable for invoice footers. */
export function inrAmountToWords(amount: number): string {
  const safe = Math.round(amount * 100) / 100;
  const rupees = Math.floor(safe + 1e-9);
  const paise = Math.round((safe - rupees) * 100);
  const rupeeWords = capitalizeWords(integerToWords(rupees));
  if (paise <= 0) return `${rupeeWords} Rupees Only`;
  const paiseWords = capitalizeWords(integerToWords(paise));
  return `${rupeeWords} Rupees and ${paiseWords} Paise Only`;
}
