import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSlice } from "../../../lib/clientReportsApi";
import { formatInr } from "../../../lib/clientReportsApi";

const COLORS = ["#1e3a5f", "#2d5a87", "#4a7ab0", "#6b9bc9", "#8fb8d9", "#b8935e", "#c9a66b", "#7d6b5a"];

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zimson-900">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-stone-500">No data for charts</div>;
}

function PieBlock({ data, title }: { data: ChartSlice[]; title: string }) {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatInr(v)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function BarBlock({ data, title }: { data: ChartSlice[]; title: string }) {
  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => formatInr(v)} />
          <Bar dataKey="value" fill="#2d5a87" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

type Props = {
  pie?: { title: string; data: ChartSlice[] };
  bar?: { title: string; data: ChartSlice[] };
  extraPie?: { title: string; data: ChartSlice[] };
};

export function ReportCharts({ pie, bar, extraPie }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {pie ? <PieBlock title={pie.title} data={pie.data} /> : null}
      {bar ? <BarBlock title={bar.title} data={bar.data} /> : null}
      {extraPie ? <PieBlock title={extraPie.title} data={extraPie.data} /> : null}
    </div>
  );
}
