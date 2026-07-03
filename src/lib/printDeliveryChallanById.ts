import { apiJson } from "./api";
import { printTransferFromMeta, type TransferPrintMeta } from "./serviceDocuments";
import type { SrfJob } from "../types/srfJob";

type PrintPackage = {
  printMeta: TransferPrintMeta;
  srfIds: string[];
  seriesCode: string;
  createdAt?: string | null;
};

export async function printDeliveryChallanById(
  dcId: string,
  jobs: SrfJob[],
  opts?: { preparedBy?: string },
): Promise<void> {
  const data = await apiJson<PrintPackage>(
    `/api/service/delivery-challans/${encodeURIComponent(dcId)}/print-package`,
  );
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const rows = data.srfIds.map((id) => byId.get(id)).filter((j): j is SrfJob => Boolean(j));
  printTransferFromMeta(data.printMeta, rows, {
    seriesCode: data.seriesCode,
    preparedBy: opts?.preparedBy,
    transferDate: data.createdAt ? new Date(data.createdAt) : new Date(),
  });
}
