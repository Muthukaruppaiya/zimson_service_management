import multer from "multer";

/** In-memory upload — persist with `persistUploadedFile()` (S3 or local). */
export function createMemoryUpload(maxBytes: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  });
}
