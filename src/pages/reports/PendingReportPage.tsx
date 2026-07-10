import { ServiceReportPageShell } from "./ServiceReportPageShell";

export function PendingReportPage() {
  return (
    <ServiceReportPageShell
      reportKey="pending"
      title="Pending report"
      description="Pending-stage SRFs with age and location context."
    />
  );
}

