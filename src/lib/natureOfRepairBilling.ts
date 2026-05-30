import {
  billableLineAmount,
  normalizeNatureOfRepair,
} from "./natureOfRepair";
import type { SrfJob } from "../types/srfJob";

/** Used spares INR that count toward customer invoice (internal / warranty non → 0). */
export function billableUsedSparesInr(
  job: SrfJob,
  usedSparesAmount: number,
): number {
  const norm = normalizeNatureOfRepair(job.natureOfRepair);
  if (norm === "warranty_non_chargeable" || norm === "internal_service") return 0;
  return usedSparesAmount;
}

/** Service / estimate base that counts toward customer bill. */
export function billableServiceBaseInr(
  job: SrfJob,
  serviceBaseAmount: number,
): number {
  const norm = normalizeNatureOfRepair(job.natureOfRepair);
  if (norm === "warranty_non_chargeable") return 0;
  return serviceBaseAmount;
}

export function billableStoreLineAmount(
  natureOfRepair: string | null | undefined,
  amountInr: number,
  opts?: { isSpareLine?: boolean },
): number {
  if (opts?.isSpareLine) {
    return billableLineAmount(natureOfRepair, amountInr, "spare");
  }
  return billableLineAmount(natureOfRepair, amountInr, null);
}
