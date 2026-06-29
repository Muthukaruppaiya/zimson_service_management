import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSlice } from "../../../lib/analyticsApi";
import { formatInr } from "../../../lib/analyticsApi";

const COLORS = ["#1e3a5f", "#2d5a87", "#4a7ab0", "#6b9bc9", "#8fb8d9", "#b8935e", "#c9a66b", "#7d6b5a", "#3d6b4f", "#5a8f6e"];

function ChartCard({ title, subtitle, children, tall }: { title: string; subtitle?: string; children: ReactNode; tall?: boolean }) {
  return (
    <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zimson-900">{title}</h3>
        {subtitle ? <p className="text-xs text-stone-500">{subtitle}</p> : null}
      </div>
      <div className={tall ? "h-80" : "h-64"}>{children}</div>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-stone-500">No data in selected period</div>;
}

export function AnalyticsPieChart({ title, data, subtitle }: { title: string; data: ChartSlice[]; subtitle?: string }) {
  if (data.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <EmptyChart />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={88}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          >
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

export function AnalyticsBarChart({
  title,
  data,
  subtitle,
  valueFormatter = formatInr,
  horizontal = true,
  tall,
}: {
  title: string;
  data: ChartSlice[];
  subtitle?: string;
  horizontal?: boolean;
  tall?: boolean;
  valueFormatter?: (n: number) => string;
}) {
  if (data.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <EmptyChart />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title} subtitle={subtitle} tall={tall ?? data.length > 8}>
      <ResponsiveContainer width="100%" height="100%">
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <XAxis type="number" tickFormatter={(v) => (valueFormatter === formatInr ? `₹${(v / 1000).toFixed(0)}k` : String(v))} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => valueFormatter(v)} />
            <Bar dataKey="value" fill="#2d5a87" radius={[0, 4, 4, 0]} />
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={56} />
            <YAxis tickFormatter={(v) => (valueFormatter === formatInr ? `₹${(v / 1000).toFixed(0)}k` : String(v))} />
            <Tooltip formatter={(v: number) => valueFormatter(v)} />
            <Bar dataKey="value" fill="#2d5a87" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AnalyticsLineChart({ title, data, subtitle }: { title: string; data: ChartSlice[]; subtitle?: string }) {
  if (data.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <EmptyChart />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2d5a87" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#2d5a87" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={48} />
          <Tooltip formatter={(v: number) => formatInr(v)} labelFormatter={(l) => `Date: ${l}`} />
          <Area type="monotone" dataKey="value" stroke="#1e3a5f" fill="url(#salesGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AnalyticsDualLineChart({
  title,
  seriesA,
  seriesB,
  labelA,
  labelB,
  subtitle,
}: {
  title: string;
  seriesA: ChartSlice[];
  seriesB: ChartSlice[];
  labelA: string;
  labelB: string;
  subtitle?: string;
}) {
  const keys = new Set([...seriesA.map((x) => x.name), ...seriesB.map((x) => x.name)]);
  const merged = [...keys]
    .sort()
    .map((name) => ({
      name,
      a: seriesA.find((x) => x.name === name)?.value ?? 0,
      b: seriesB.find((x) => x.name === name)?.value ?? 0,
    }));

  if (merged.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <EmptyChart />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} width={40} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="a" name={labelA} stroke="#2d5a87" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="b" name={labelB} stroke="#b8935e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
