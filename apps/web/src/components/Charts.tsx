import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

const DEFAULT_COLORS = ['#8b5cf6', '#22d3ee', '#fbbf24', '#34d399', '#f472b6'];

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(17,16,29,0.96)',
    border: '1px solid rgba(139,92,246,0.35)',
    borderRadius: 10,
    fontSize: 12,
    color: '#e9e7f6',
  },
  labelStyle: { color: '#9a96b8', fontSize: 11 },
  itemStyle: { fontSize: 12 },
} as const;

export function TrendChart({
  data,
  xKey = 'date',
  series,
  height = 280,
}: {
  data: Record<string, unknown>[];
  xKey?: string;
  series: SeriesDef[];
  height?: number;
}) {
  if (!data || !data.length) {
    return (
      <div className="chart-box" style={{ height }}>
        <div className="state-box" style={{ padding: 20 }}>
          <div className="state-desc">暂无趋势数据</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} minTickGap={22} />
          <YAxis tickLine={false} axisLine={false} width={46} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: '#9a96b8' }} /> : null}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrendChart({
  data,
  xKey = 'date',
  series,
  height = 260,
}: {
  data: Record<string, unknown>[];
  xKey?: string;
  series: SeriesDef[];
  height?: number;
}) {
  if (!data || !data.length) {
    return (
      <div className="chart-box" style={{ height }}>
        <div className="state-box" style={{ padding: 20 }}>
          <div className="state-desc">暂无趋势数据</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 16, left: -10, bottom: 4 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} stopOpacity={0.4} />
                <stop offset="100%" stopColor={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} minTickGap={22} />
          <YAxis tickLine={false} axisLine={false} width={46} />
          <Tooltip {...tooltipStyle} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              fill={`url(#grad-${s.key})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({
  data,
  xKey = 'name',
  series,
  height = 280,
  layout = 'horizontal',
}: {
  data: Record<string, unknown>[];
  xKey?: string;
  series: SeriesDef[];
  height?: number;
  layout?: 'horizontal' | 'vertical';
}) {
  if (!data || !data.length) {
    return (
      <div className="chart-box" style={{ height }}>
        <div className="state-box" style={{ padding: 20 }}>
          <div className="state-desc">暂无图表数据</div>
        </div>
      </div>
    );
  }
  const vertical = layout === 'vertical';
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 12, right: 18, left: vertical ? 8 : -10, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 4" vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={46} />
            </>
          )}
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={38}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
