import { ServiceReportPageShell } from "./ServiceReportPageShell";

export function TransferReportPage() {
  return (
    <ServiceReportPageShell
      reportKey="transfer"
      title="Transfer report"
      description="Transfer lifecycle summary for SRFs moved between locations."
    />
  );
}

