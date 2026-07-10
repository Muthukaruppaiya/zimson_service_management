import { ServiceReportPageShell } from "./ServiceReportPageShell";

export function WatchNotReturnedReportPage() {
  return (
    <ServiceReportPageShell
      reportKey="watch_not_returned"
      title="Watch not returned report"
      description="Watches dispatched from service centre but still not received at store."
    />
  );
}

