import { useMemo, useState } from 'react';
import type {
  GeoglowsEnsembleBundle,
  GeoglowsForecastBundle,
  GeoglowsHistoricalResponse,
  GeoglowsReturnPeriodsResponse,
} from '../../types/geospatial';

interface ForecastHydrographChartProps {
  forecast: GeoglowsForecastBundle;
  ensembles?: GeoglowsEnsembleBundle | null;
  returnPeriods?: GeoglowsReturnPeriodsResponse | null;
  showEnsembles: boolean;
  showHighRes: boolean;
  showReturnPeriods: boolean;
}

function fmtUtcShort(iso: string): string {
  // Expected formats: 2026-11-14T00:00:00Z or 2026-11-14 00:00:00
  const clean = iso.replace(' ', 'T');
  const d = new Date(clean.endsWith('Z') ? clean : `${clean}Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hr = String(d.getUTCHours()).padStart(2, '0');
  return `${mo}-${da} ${hr}Z`;
}

function buildPolylinePoints(
  values: Array<number | null>,
  xFor: (i: number) => number,
  yFor: (v: number) => number
): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      current.push(`${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`);
    } else if (current.length > 0) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
    }
  });
  if (current.length > 1) segments.push(current.join(' '));
  return segments;
}

function buildBandPolygon(
  upper: Array<number | null>,
  lower: Array<number | null>,
  xFor: (i: number) => number,
  yFor: (v: number) => number
): string {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i < upper.length; i++) {
    const u = upper[i];
    const l = lower[i];
    if (typeof u === 'number' && typeof l === 'number' && Number.isFinite(u) && Number.isFinite(l)) {
      top.push(`${xFor(i).toFixed(1)},${yFor(u).toFixed(1)}`);
      bottom.unshift(`${xFor(i).toFixed(1)},${yFor(l).toFixed(1)}`);
    }
  }
  if (top.length < 2) return '';
  return [...top, ...bottom].join(' ');
}

export function ForecastHydrographChart({
  forecast,
  ensembles,
  returnPeriods,
  showEnsembles,
  showHighRes,
  showReturnPeriods,
}: ForecastHydrographChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { stats } = forecast;
  const n = stats.datetime.length;

  const yMax = useMemo(() => {
    let peak = 1;
    const scan = (arr: Array<number | null>) => {
      for (const v of arr) {
        if (typeof v === 'number' && Number.isFinite(v) && v > peak) peak = v;
      }
    };
    scan(stats.flow_max);
    scan(stats.flow_avg);
    scan(stats.flow_med);
    if (showHighRes) scan(stats.high_res);
    if (showEnsembles && ensembles) {
      for (const member of Object.values(ensembles.members)) scan(member);
    }
    if (showReturnPeriods && returnPeriods) {
      const rp2 = returnPeriods.thresholds.rp2;
      if (rp2 && rp2 > peak && rp2 < peak * 2.5) peak = rp2;
      const rp5 = returnPeriods.thresholds.rp5;
      if (rp5 && rp5 > peak && rp5 < peak * 1.8) peak = rp5;
    }
    return peak * 1.1;
  }, [stats, ensembles, returnPeriods, showEnsembles, showHighRes, showReturnPeriods]);

  if (n < 2) {
    return (
      <div className="text-xs p-3" style={{ color: 'var(--calcite-color-text-3)' }}>
        Insufficient forecast time steps available for hydrograph rendering.
      </div>
    );
  }

  const W = 560;
  const H = 230;
  const padL = 48;
  const padR = 14;
  const padT = 14;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xFor = (i: number) => padL + (i / Math.max(1, n - 1)) * plotW;
  const yFor = (v: number) => padT + plotH - (Math.max(0, v) / yMax) * plotH;

  const minMaxPoly = buildBandPolygon(stats.flow_max, stats.flow_min, xFor, yFor);
  const iqrPoly = buildBandPolygon(stats.flow_75p, stats.flow_25p, xFor, yFor);
  const medSegments = buildPolylinePoints(stats.flow_med, xFor, yFor);
  const avgSegments = buildPolylinePoints(stats.flow_avg, xFor, yFor);
  const hresSegments = showHighRes ? buildPolylinePoints(stats.high_res, xFor, yFor) : [];

  const ensemblePaths = useMemo(() => {
    if (!showEnsembles || !ensembles) return [];
    const out: string[] = [];
    for (const memberName of ensembles.memberNames) {
      const vals = ensembles.members[memberName];
      if (!vals) continue;
      // Map ensemble datetime index if length matches stats, otherwise clip cleanly
      const segs = buildPolylinePoints(vals.slice(0, n), xFor, yFor);
      out.push(...segs);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEnsembles, ensembles, n, yMax]);

  const rpLines = useMemo(() => {
    if (!showReturnPeriods || !returnPeriods) return [];
    const items: Array<{ label: string; value: number; color: string }> = [];
    const t = returnPeriods.thresholds;
    if (t.rp2) items.push({ label: '2-yr', value: t.rp2, color: '#eab308' });
    if (t.rp5) items.push({ label: '5-yr', value: t.rp5, color: '#f97316' });
    if (t.rp10) items.push({ label: '10-yr', value: t.rp10, color: '#ef4444' });
    if (t.rp25) items.push({ label: '25-yr', value: t.rp25, color: '#b91c1c' });
    return items.filter((it) => it.value <= yMax);
  }, [showReturnPeriods, returnPeriods, yMax]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndices = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];

  const activeIdx = hoverIdx !== null ? Math.min(n - 1, Math.max(0, hoverIdx)) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={`GEOGLOWS forecast streamflow hydrograph for LINKNO ${forecast.linkno}`}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const frac = Math.min(1, Math.max(0, (relX - padL) / plotW));
          setHoverIdx(Math.round(frac * (n - 1)));
        }}
      >
        {/* Grid lines & Y-axis labels */}
        {yTicks.map((f) => {
          const val = f * yMax;
          const y = yFor(val);
          return (
            <g key={f}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="var(--calcite-color-border-3)"
                strokeWidth="0.7"
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="var(--calcite-color-text-3)"
                style={{ fontFamily: 'var(--calcite-code-family)' }}
              >
                {val >= 100 ? Math.round(val) : val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Y-axis unit label */}
        <text
          x={11}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize="9"
          fill="var(--calcite-color-text-3)"
          transform={`rotate(-90 11 ${padT + plotH / 2})`}
        >
          Discharge (m³/s)
        </text>

        {/* Return Period Threshold Lines */}
        {rpLines.map((rp) => {
          const y = yFor(rp.value);
          return (
            <g key={rp.label}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke={rp.color}
                strokeWidth="1.1"
                strokeDasharray="4 3"
              />
              <text
                x={W - padR - 2}
                y={y - 3}
                textAnchor="end"
                fontSize="8.5"
                fontWeight="600"
                fill={rp.color}
                style={{ fontFamily: 'var(--calcite-code-family)' }}
              >
                {rp.label} ({rp.value.toFixed(0)} m³/s)
              </text>
            </g>
          );
        })}

        {/* Min–Max Envelope */}
        {minMaxPoly && (
          <polygon points={minMaxPoly} fill="var(--calcite-color-brand)" fillOpacity="0.11" />
        )}

        {/* 25th–75th Percentile IQR */}
        {iqrPoly && (
          <polygon points={iqrPoly} fill="var(--calcite-color-brand)" fillOpacity="0.24" />
        )}

        {/* 52 Ensemble Members */}
        {ensemblePaths.map((pts, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="var(--calcite-color-text-3)"
            strokeOpacity="0.28"
            strokeWidth="0.7"
            points={pts}
          />
        ))}

        {/* Ensemble Mean */}
        {avgSegments.map((pts, i) => (
          <polyline
            key={`avg-${i}`}
            fill="none"
            stroke="var(--calcite-color-status-info)"
            strokeWidth="1.4"
            strokeDasharray="3 2"
            points={pts}
          />
        ))}

        {/* High-Res Deterministic Member */}
        {hresSegments.map((pts, i) => (
          <polyline
            key={`hr-${i}`}
            fill="none"
            stroke="var(--calcite-color-status-warning)"
            strokeWidth="1.7"
            points={pts}
          />
        ))}

        {/* Ensemble Median */}
        {medSegments.map((pts, i) => (
          <polyline
            key={`med-${i}`}
            fill="none"
            stroke="var(--calcite-color-brand)"
            strokeWidth="2.3"
            points={pts}
          />
        ))}

        {/* X-axis Ticks */}
        {xTickIndices.map((idx) => {
          const x = xFor(idx);
          return (
            <g key={idx}>
              <line
                x1={x}
                y1={padT + plotH}
                x2={x}
                y2={padT + plotH + 4}
                stroke="var(--calcite-color-border-2)"
              />
              <text
                x={x}
                y={padT + plotH + 15}
                textAnchor={idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle'}
                fontSize="8.5"
                fill="var(--calcite-color-text-3)"
                style={{ fontFamily: 'var(--calcite-code-family)' }}
              >
                {fmtUtcShort(stats.datetime[idx])}
              </text>
            </g>
          );
        })}

        {/* Hover Crosshair */}
        {activeIdx !== null && (
          <g>
            <line
              x1={xFor(activeIdx)}
              y1={padT}
              x2={xFor(activeIdx)}
              y2={padT + plotH}
              stroke="var(--calcite-color-text-2)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            {typeof stats.flow_med[activeIdx] === 'number' && (
              <circle
                cx={xFor(activeIdx)}
                cy={yFor(stats.flow_med[activeIdx]!)}
                r="4"
                fill="var(--calcite-color-brand)"
                stroke="var(--calcite-color-foreground-1)"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}
      </svg>

      {/* Legend & Live Cursor Readout */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 rounded text-xs"
        style={{
          backgroundColor: 'var(--calcite-color-foreground-2)',
          border: '1px solid var(--calcite-color-border-3)',
          fontFamily: 'var(--calcite-code-family)',
          color: 'var(--calcite-color-text-2)',
        }}
      >
        {activeIdx !== null ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span style={{ color: 'var(--calcite-color-text-1)', fontWeight: 600 }}>
              {fmtUtcShort(stats.datetime[activeIdx])}
            </span>
            <span>Med: {stats.flow_med[activeIdx]?.toFixed(2) ?? '—'} m³/s</span>
            <span>Mean: {stats.flow_avg[activeIdx]?.toFixed(2) ?? '—'} m³/s</span>
            <span>
              IQR: {stats.flow_25p[activeIdx]?.toFixed(1) ?? '—'}–
              {stats.flow_75p[activeIdx]?.toFixed(1) ?? '—'}
            </span>
            <span>
              Min–Max: {stats.flow_min[activeIdx]?.toFixed(1) ?? '—'}–
              {stats.flow_max[activeIdx]?.toFixed(1) ?? '—'}
            </span>
            {showHighRes && (
              <span>HRES: {stats.high_res[activeIdx]?.toFixed(2) ?? '—'}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>Solid blue: Median</span>
            <span>Dashed: Mean</span>
            <span>Shaded: IQR (25–75%) &amp; Min–Max</span>
            {showHighRes && <span>Amber: High-Res (10d)</span>}
            <span>· Hover chart for step values</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface HistoricalStreamflowChartProps {
  data: GeoglowsHistoricalResponse;
  returnPeriods?: GeoglowsReturnPeriodsResponse | null;
}

export function HistoricalStreamflowChart({
  data,
  returnPeriods,
}: HistoricalStreamflowChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const points = data.points;
  const n = points.length;

  const yMax = useMemo(() => {
    let maxVal = 1;
    for (const p of points) {
      if (p.flowM3s > maxVal) maxVal = p.flowM3s;
    }
    return maxVal * 1.1;
  }, [points]);

  if (n === 0) {
    return (
      <div className="text-xs p-3" style={{ color: 'var(--calcite-color-text-3)' }}>
        No historical retrospective values returned for the selected range.
      </div>
    );
  }

  const W = 560;
  const H = 205;
  const padL = 48;
  const padR = 14;
  const padT = 14;
  const padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const useBars = n <= 90;
  const xFor = (i: number) =>
    useBars
      ? padL + ((i + 0.5) / n) * plotW
      : padL + (i / Math.max(1, n - 1)) * plotW;
  const yFor = (v: number) => padT + plotH - (Math.max(0, v) / yMax) * plotH;

  const polyPoints = !useBars
    ? points.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.flowM3s).toFixed(1)}`).join(' ')
    : '';
  const areaPoints = !useBars
    ? `${padL},${padT + plotH} ${polyPoints} ${padL + plotW},${padT + plotH}`
    : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndices =
    n <= 12
      ? points.map((_, i) => i)
      : [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];

  const rp2 = returnPeriods?.thresholds.rp2;
  const activeIdx = hoverIdx !== null ? Math.min(n - 1, Math.max(0, hoverIdx)) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={`GEOGLOWS historical streamflow chart (${data.label}) for LINKNO ${data.linkno}`}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const frac = Math.min(1, Math.max(0, (relX - padL) / plotW));
          setHoverIdx(Math.min(n - 1, Math.floor(frac * n)));
        }}
      >
        {yTicks.map((f) => {
          const val = f * yMax;
          const y = yFor(val);
          return (
            <g key={f}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="var(--calcite-color-border-3)"
                strokeWidth="0.7"
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="var(--calcite-color-text-3)"
                style={{ fontFamily: 'var(--calcite-code-family)' }}
              >
                {val >= 100 ? Math.round(val) : val.toFixed(1)}
              </text>
            </g>
          );
        })}

        <text
          x={11}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize="9"
          fill="var(--calcite-color-text-3)"
          transform={`rotate(-90 11 ${padT + plotH / 2})`}
        >
          Flow (m³/s)
        </text>

        {rp2 && rp2 <= yMax && (
          <g>
            <line
              x1={padL}
              y1={yFor(rp2)}
              x2={W - padR}
              y2={yFor(rp2)}
              stroke="#eab308"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text
              x={W - padR - 2}
              y={yFor(rp2) - 3}
              textAnchor="end"
              fontSize="8.5"
              fill="#eab308"
              style={{ fontFamily: 'var(--calcite-code-family)' }}
            >
              2-yr RP ({rp2.toFixed(0)} m³/s)
            </text>
          </g>
        )}

        {useBars ? (
          points.map((p, i) => {
            const bw = Math.max(2, (plotW / n) * 0.72);
            const x = xFor(i) - bw / 2;
            const y = yFor(p.flowM3s);
            return (
              <rect
                key={`${p.date}-${i}`}
                x={x}
                y={y}
                width={bw}
                height={Math.max(1, padT + plotH - y)}
                rx="1"
                fill={
                  activeIdx === i
                    ? 'var(--calcite-color-brand-hover)'
                    : 'var(--calcite-color-brand)'
                }
                fillOpacity={activeIdx === i ? '0.95' : '0.78'}
              />
            );
          })
        ) : (
          <>
            <polygon points={areaPoints} fill="var(--calcite-color-brand)" fillOpacity="0.16" />
            <polyline
              fill="none"
              stroke="var(--calcite-color-brand)"
              strokeWidth="1.6"
              points={polyPoints}
            />
          </>
        )}

        {xTickIndices.map((idx) => {
          const x = xFor(idx);
          return (
            <text
              key={`${idx}-${points[idx].date}`}
              x={x}
              y={padT + plotH + 15}
              textAnchor={
                !useBars && idx === 0 ? 'start' : !useBars && idx === n - 1 ? 'end' : 'middle'
              }
              fontSize="8.5"
              fill="var(--calcite-color-text-3)"
              style={{ fontFamily: 'var(--calcite-code-family)' }}
            >
              {points[idx].date.slice(0, 10)}
            </text>
          );
        })}

        {activeIdx !== null && (
          <line
            x1={xFor(activeIdx)}
            y1={padT}
            x2={xFor(activeIdx)}
            y2={padT + plotH}
            stroke="var(--calcite-color-text-2)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      <div
        className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 rounded text-xs"
        style={{
          backgroundColor: 'var(--calcite-color-foreground-2)',
          border: '1px solid var(--calcite-color-border-3)',
          fontFamily: 'var(--calcite-code-family)',
          color: 'var(--calcite-color-text-2)',
        }}
      >
        {activeIdx !== null ? (
          <span>
            <strong style={{ color: 'var(--calcite-color-text-1)' }}>
              {points[activeIdx].date}
            </strong>
            : {points[activeIdx].flowM3s.toFixed(2)} m³/s
          </span>
        ) : (
          <span>
            {data.label} · {n} records · Hover chart to inspect individual values
          </span>
        )}
      </div>
    </div>
  );
}
