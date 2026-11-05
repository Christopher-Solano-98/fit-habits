import type { MetricKey } from '@shared/types.ts';
import { fmtMonthYear } from '@shared/dates.ts';
import { fmtValue, type Point } from '@shared/metrics.ts';
import { toDate } from '@shared/dates.ts';

/** Small progress chart: dated points on a time axis, latest point emphasised. */
export function LineChart({ metric, points, target }: { metric: MetricKey; points: Point[]; target?: number }) {
  const W = 340, H = 170, L = 12, R = 12, T = 22, B = 28;
  if (!points.length) return null;
  const xs = points.map((p) => toDate(p.date).getTime());
  const vals = points.map((p) => p.value).concat(target ?? []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let v0 = Math.min(...vals), v1 = Math.max(...vals);
  const pad = (v1 - v0 || Math.abs(v1) || 1) * 0.15;
  v0 -= pad; v1 += pad;
  const X = (t: number) => (x1 === x0 ? W / 2 : L + ((t - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v: number) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  const last = points.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric} over time`} className="chart">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="chart-axis" />
      {target !== undefined && (
        <g>
          <line x1={L} x2={W - R} y1={Y(target)} y2={Y(target)} className="chart-target" />
          <text x={W - R} y={Y(target) - 6} textAnchor="end" className="chart-target-label">Goal {fmtValue(metric, target)}</text>
        </g>
      )}
      <path d={line} className="chart-line" />
      {points.map((p, i) => (
        <g key={p.date + i}>
          <circle cx={X(xs[i])} cy={Y(p.value)} r={i === last ? 5.5 : 3.5} className={i === last ? 'chart-dot-last' : 'chart-dot'} />
          {(i === 0 || i === last || points.length <= 5) && (
            <text x={X(xs[i])} y={Y(p.value) - 10} textAnchor={i === 0 && points.length > 1 ? 'start' : i === last && points.length > 1 ? 'end' : 'middle'} className={i === last ? 'chart-val-last' : 'chart-val'}>
              {fmtValue(metric, p.value)}
            </text>
          )}
          {(i === 0 || i === last || points.length <= 4) && (
            <text x={X(xs[i])} y={H - 8} textAnchor={i === 0 && points.length > 1 ? 'start' : i === last && points.length > 1 ? 'end' : 'middle'} className="chart-date">
              {fmtMonthYear(p.date)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
