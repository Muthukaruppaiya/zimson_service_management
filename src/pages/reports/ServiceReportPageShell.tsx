import type { ReactNode } from "react";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { SERVICE_REPORT_COLUMNS, type ServiceReportKey, downloadCsv, useServiceReportRows } from "./serviceReportUtils";

type Props = {
  reportKey: ServiceReportKey;
  title: string;
  description: string;
  children?: ReactNode;
};

export function ServiceReportPageShell({ reportKey, title, description, children }: Props) {
  const { loading, error, kpis, rowsByReport, refreshAll } = useServiceReportRows();
  const rows = rowsByReport[reportKey] ?? [];
  const cols = SERVICE_REPORT_COLUMNS[reportKey];

  return (
    <FormPageShell
      breadcrumb="Reports"
      title={title}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCsv(`${reportKey}_${new Date().toISOString().slice(0, 10)}.csv`, cols, rows)}
            className="rounded-lg border border-rlx-gold/60 bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
            disabled={rows.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="rounded-lg border border-rlx-gold/60 bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
          >
            Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Open SRFs">
          <p className="text-lg font-semibold text-rlx-green">{kpis.openSrf}</p>
        </Card>
        <Card title="Not Returned">
          <p className="text-lg font-semibold text-amber-700">{kpis.notReturned}</p>
        </Card>
        <Card title="Pending Jobs">
          <p className="text-lg font-semibold text-indigo-700">{kpis.pending}</p>
        </Card>
        <Card title="Quick Bills (history)">
          <p className="text-lg font-semibold text-stone-700">{kpis.quickBills}</p>
        </Card>
      </div>

      <Card title="Description" className="mt-3">
        <p className="text-sm text-stone-700">{description}</p>
        {children}
      </Card>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <p className="rounded-lg border border-rlx-rule bg-white px-3 py-5 text-sm text-stone-600">Loading report data...</p>
        ) : (
          <ReportDataTable title={title} columns={cols} rows={rows} emptyMessage="No rows for this report." />
        )}
      </div>
    </FormPageShell>
  );
}

