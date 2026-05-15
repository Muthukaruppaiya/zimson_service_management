/** Customer SRF capture uploads — keep in sync with server multer `limits.fileSize` for `/api/public/srf-photo/upload`. */
export const SRF_CUSTOMER_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export function srfCustomerPhotoMaxSizeLabel(): string {
  return "8 MB";
}
