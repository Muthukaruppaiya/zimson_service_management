/** Download AWS RDS global CA bundle for PostgreSQL sslmode=verify-full */
import fs from "node:fs";
import path from "node:path";

const url = "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem";
const outDir = path.join(process.cwd(), "certs");
const outFile = path.join(outDir, "global-bundle.pem");

await fs.promises.mkdir(outDir, { recursive: true });
const res = await fetch(url);
if (!res.ok) {
  console.error("Download failed:", res.status, res.statusText);
  process.exit(1);
}
const pem = await res.text();
await fs.promises.writeFile(outFile, pem, "utf8");
console.log("Saved", outFile);
