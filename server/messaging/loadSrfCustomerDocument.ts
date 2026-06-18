import type { Pool } from "pg";
import { readStoredFileBuffer } from "../storage/fileStorage";

export type SrfCustomerDocument = {
  filePath: string;
  mime: string;
  buffer: Buffer;
};

function isPdfBuffer(buf: Buffer, mime: string): boolean {
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF") return true;
  return (mime || "").toLowerCase().includes("pdf");
}

/** Latest customer-uploaded SRF document (photo_kind = document), when it is a PDF. */
export async function loadSrfCustomerDocumentPdf(
  pool: Pool,
  srfId: string,
): Promise<SrfCustomerDocument | null> {
  const { rows } = await pool.query<{ file_path: string; mime: string }>(
    `SELECT file_path, mime
     FROM srf_job_photos
     WHERE srf_id = $1::uuid AND photo_kind = 'document'
     ORDER BY created_at DESC
     LIMIT 1`,
    [srfId],
  );
  const row = rows[0];
  if (!row?.file_path?.trim()) return null;

  const buffer = await readStoredFileBuffer(row.file_path);
  if (!buffer || buffer.length < 100) return null;
  if (!isPdfBuffer(buffer, row.mime ?? "")) return null;

  return {
    filePath: row.file_path,
    mime: row.mime?.trim() || "application/pdf",
    buffer,
  };
}
