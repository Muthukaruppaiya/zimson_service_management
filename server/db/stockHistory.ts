type DbQueryable = {
  query: (sql: string, values?: unknown[]) => Promise<unknown>;
};

export type StockHistoryInput = {
  spareId: string;
  eventType:
    | "SPARE_CREATED"
    | "MANUAL_STOCK_SET"
    | "PURCHASE_IN"
    | "TRANSFER_OUT"
    | "TRANSFER_IN";
  locationKey?: string | null;
  locationType?: "HO" | "STORE" | null;
  regionId?: string | null;
  storeId?: string | null;
  quantityChange?: number | null;
  balanceAfter?: number | null;
  referenceType?: "PR" | "PO" | "GRN" | "MANUAL" | null;
  referenceNumber?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

export async function appendStockHistory(db: DbQueryable, input: StockHistoryInput): Promise<void> {
  await db.query(
    `INSERT INTO spare_stock_history (
      spare_id,
      event_type,
      location_key,
      location_type,
      region_id,
      store_id,
      quantity_change,
      balance_after,
      reference_type,
      reference_number,
      note,
      created_by
    ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      input.spareId,
      input.eventType,
      input.locationKey ?? null,
      input.locationType ?? null,
      input.regionId ?? null,
      input.storeId ?? null,
      input.quantityChange ?? null,
      input.balanceAfter ?? null,
      input.referenceType ?? null,
      input.referenceNumber ?? null,
      input.note ?? null,
      input.createdBy ?? null,
    ],
  );
}
