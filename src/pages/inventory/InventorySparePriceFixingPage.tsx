import { useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";

const th = "border-b border-zimson-200 bg-zimson-50/90 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-600";
const td = "border-b border-zimson-100 px-3 py-2 align-middle text-sm";
const inputCell =
  "w-full min-w-[5.5rem] rounded-lg border border-zimson-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-zimson-400/40";

export function InventorySparePriceFixingPage() {
  const { regions } = useRegions();
  const { activeSpares } = useSpares();
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});

  function cell(spareId: string, regionId: string) {
    return matrix[spareId]?.[regionId] ?? "";
  }

  function setCell(spareId: string, regionId: string, value: string) {
    setMatrix((prev) => ({
      ...prev,
      [spareId]: { ...prev[spareId], [regionId]: value },
    }));
  }

  const cols = regions.length > 0 ? regions : [{ id: "r1", name: "Regional office 1", stores: [] as { id: string; name: string }[] }];

  return (
    <div>
      <InventoryBreadcrumb current="Spare price fixing" />
      <PageHeader
        title="Spare price fixing (regional)"
        description="Same spare SKU can carry different list / issue prices and tax classes per regional HO. Rows come from the spare catalogue (active parts only)."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/inventory/spares"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Spare catalogue
            </Link>
            <Link
              to="/inventory"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Inventory home
            </Link>
          </div>
        }
      />

      <Card title="Regional matrix" subtitle="MRP or issue price (INR)">
        <p className="mb-4 text-sm text-stone-600">
          This is a <strong>separate sub-module</strong> under spares: maintain prices in{" "}
          <Link className="font-medium text-zimson-800 underline" to="/regions">
            Regions &amp; stores
          </Link>{" "}
          first, then set one column per regional HO. Add parts in{" "}
          <Link className="font-medium text-zimson-800 underline" to="/inventory/spares">
            Spare catalogue
          </Link>
          .
        </p>

        {activeSpares.length === 0 ? (
          <p className="text-sm text-stone-600">No active spares in the catalogue.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className={th}>SKU</th>
                  <th className={th}>Part name</th>
                  {cols.map((r) => (
                    <th key={r.id} className={th}>
                      {r.name}
                      <span className="mt-0.5 block font-normal normal-case text-stone-500">(regional rate)</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSpares.map((row) => (
                  <tr key={row.id}>
                    <td className={`${td} font-mono text-xs font-semibold text-zimson-900`}>{row.sku}</td>
                    <td className={td}>{row.name}</td>
                    {cols.map((r) => (
                      <td key={r.id} className={td}>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          value={cell(row.id, r.id)}
                          onChange={(e) => setCell(row.id, r.id, e.target.value)}
                          className={inputCell}
                          aria-label={`${row.sku} price ${r.name}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
