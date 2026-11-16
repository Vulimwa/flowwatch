import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  CalciteBlock,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteLabel,
  CalciteLoader,
  CalciteMeter,
  CalciteNotice,
  CalciteOption,
  CalciteSelect,
  CalciteSlider,
  CalciteTable,
  CalciteTableCell,
  CalciteTableHeader,
  CalciteTableRow,
} from '@esri/calcite-components-react';

import {
  TANA_HYDROPOWER_ASSETS,
  runReleaseTradeoffAndSensitivity,
} from '../../analytics/reservoirOperations';
import { fetchGeoglowsForecast } from '../../services/geoglows/geoglowsService';
import type {
  DamScenarioParams,
  DamScenarioResult,
  GeoglowsForecastBundle,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
} from '../../types/geospatial';
import {
  ILLUSTRATIVE_DAM_PRESETS,
  runIllustrativeDamSimulation,
} from '../../utils/damSimulator';

interface WaterOperationsWorkspaceProps {
  geoglowsIndex?: GeoglowsReachIndexResponse | null;
  selectedLinkno?: number | null;
  onScenarioResultChange?: (res: DamScenarioResult) => void;
  onOpenIndicatorInfo?: (indicatorId: string) => void;
  demoPresetRequest?: { id: string; nonce: number } | null;
}

function positionLabel(pos: GeoglowsReachRecord['damPosition']): string {
  switch (pos) {
    case 'upstream_masinga':
      return 'Upstream of Masinga';
    case 'seven_forks_cascade':
      return 'Seven Forks Cascade';
    case 'downstream_cascade':
      return 'Downstream of Cascade';
    default:
      return 'Basin Tributary';
  }
}

export function WaterOperationsWorkspace({
  geoglowsIndex,
  selectedLinkno,
  onScenarioResultChange,
  onOpenIndicatorInfo,
  demoPresetRequest,
}: WaterOperationsWorkspaceProps) {
  const [scenarioA, setScenarioA] = useState<DamScenarioParams>(
    ILLUSTRATIVE_DAM_PRESETS[0].params
  );
  const [scenarioB, setScenarioB] = useState<DamScenarioParams>(
    ILLUSTRATIVE_DAM_PRESETS[1].params
  );

  // Isolated External GEOGLOWS Reference Reach (Read-Only)
  const referenceReaches = useMemo(() => {
    if (!geoglowsIndex) return [];
    const upstream = geoglowsIndex.reaches
      .filter((r) => r.damPosition === 'upstream_masinga')
      .slice(0, 12);
    const cascade = geoglowsIndex.reaches
      .filter((r) => r.damPosition === 'seven_forks_cascade')
      .slice(0, 6);
    const downstream = geoglowsIndex.reaches
      .filter((r) => r.damPosition === 'downstream_cascade')
      .slice(0, 6);
    const combined = [...upstream, ...cascade, ...downstream];
    if (selectedLinkno && !combined.some((r) => r.linkno === selectedLinkno)) {
      const sel = geoglowsIndex.reaches.find((r) => r.linkno === selectedLinkno);
      if (sel) combined.unshift(sel);
    }
    return combined;
  }, [geoglowsIndex, selectedLinkno]);

  const [refLinkno, setRefLinkno] = useState<number | null>(null);
  const [refForecast, setRefForecast] = useState<GeoglowsForecastBundle | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  useEffect(() => {
    if (refLinkno === null && referenceReaches.length > 0) {
      const defaultUpstream =
        referenceReaches.find((r) => r.damPosition === 'upstream_masinga') ||
        referenceReaches[0];
      setRefLinkno(defaultUpstream.linkno);
    }
  }, [referenceReaches, refLinkno]);

  useEffect(() => {
    if (refLinkno === null) return;
    const controller = new AbortController();
    setRefLoading(true);
    setRefError(null);
    fetchGeoglowsForecast(refLinkno, null, controller.signal)
      .then((res) => {
        setRefForecast(res);
        setRefLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setRefError(err instanceof Error ? err.message : 'Reference forecast failed');
        setRefLoading(false);
      });
    return () => controller.abort();
  }, [refLinkno]);

  const activeRefReach = useMemo(
    () => referenceReaches.find((r) => r.linkno === refLinkno) || null,
    [referenceReaches, refLinkno]
  );

  const forecast15DayMean = useMemo(() => {
    if (!refForecast) return null;
    const vals = refForecast.stats.flow_med.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [refForecast]);

  const resultA = useMemo(() => runIllustrativeDamSimulation(scenarioA), [scenarioA]);
  const resultB = useMemo(() => runIllustrativeDamSimulation(scenarioB), [scenarioB]);
  const tradeoffs = useMemo(() => runReleaseTradeoffAndSensitivity(scenarioA), [scenarioA]);

  useEffect(() => {
    onScenarioResultChange?.(resultA);
  }, [resultA, onScenarioResultChange]);

  const updateA = (patch: Partial<DamScenarioParams>) => {
    setScenarioA((prev) => ({ ...prev, ...patch }));
  };

  const applyPreset = (presetId: string) => {
    const found = ILLUSTRATIVE_DAM_PRESETS.find((p) => p.id === presetId);
    if (found) setScenarioA({ ...found.params });
  };

  useEffect(() => {
    if (!demoPresetRequest) return;
    const found = ILLUSTRATIVE_DAM_PRESETS.find((preset) => preset.id === demoPresetRequest.id);
    if (found) setScenarioA({ ...found.params });
  }, [demoPresetRequest]);

  const handleReset = () => {
    setScenarioA({ ...ILLUSTRATIVE_DAM_PRESETS[0].params });
    setScenarioB({ ...ILLUSTRATIVE_DAM_PRESETS[1].params });
  };

  const statusMeta = (
    status: string
  ): { kind: 'brand' | 'neutral'; token: string; icon: 'exclamation-mark-triangle' | 'check-circle' } => {
    if (status.includes('Critical') || status.includes('Surge') || status.includes('High Spill')) {
      return {
        kind: 'neutral',
        token: 'var(--calcite-color-status-danger)',
        icon: 'exclamation-mark-triangle',
      };
    }
    if (status.includes('Watch') || status.includes('Elevated') || status.includes('Low Baseflow')) {
      return {
        kind: 'neutral',
        token: 'var(--calcite-color-status-warning)',
        icon: 'exclamation-mark-triangle',
      };
    }
    return {
      kind: 'brand',
      token: 'var(--calcite-color-status-success)',
      icon: 'check-circle',
    };
  };

  const storageMeta = statusMeta(resultA.storageRiskStatus);
  const downstreamMeta = statusMeta(resultA.downstreamStatus);
  const maxCap = Math.max(resultA.params.capacityMcm, resultB.params.capacityMcm);

  return (
    <div className="p-3 flex flex-col gap-3">
      <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
        <div slot="title">Hypothetical Water Operations Lab — Not Live KenGen SCADA</div>
        <div slot="message">
          All storage, inflow, and turbine release values below are user-configured hypothetical inputs. No KenGen telemetry or operating rule curve is connected. Releases do NOT reach Garissa unchanged due to the Seven Forks cascade and lateral tributaries.
        </div>
        {onOpenIndicatorInfo && (
          <CalciteButton
            slot="actions-end"
            scale="s"
            appearance="outline"
            onClick={() => onOpenIndicatorInfo('ind_dam_scenario_balance')}
          >
            Equations
          </CalciteButton>
        )}
      </CalciteNotice>

      {/* Isolated External GEOGLOWS Forecast Reference */}
      <CalciteBlock
        collapsible
        open
        heading="External GEOGLOWS Forecast Reference (Read-Only)"
        description="Hydrologically separated model output — not KenGen dam inflow telemetry"
      >
        <div className="flex flex-col gap-2 text-xs">
          {referenceReaches.length > 0 ? (
            <>
              <CalciteLabel scale="s" className="mb-0">
                Reference GEOGLOWS Reach (Tana Basin)
                <CalciteSelect
                  scale="s"
                  label="Select GEOGLOWS reference reach"
                  value={refLinkno ? String(refLinkno) : ''}
                  onCalciteSelectChange={(e) => {
                    const val = Number((e.target as HTMLCalciteSelectElement).value);
                    if (Number.isFinite(val) && val > 0) setRefLinkno(val);
                  }}
                >
                  {referenceReaches.map((r) => (
                    <CalciteOption
                      key={r.linkno}
                      value={String(r.linkno)}
                      selected={r.linkno === refLinkno}
                    >
                      [{positionLabel(r.damPosition)}] {r.displayName} (LINKNO {r.linkno})
                    </CalciteOption>
                  ))}
                </CalciteSelect>
              </CalciteLabel>

              {activeRefReach && (
                <div className="flex flex-wrap gap-1">
                  <CalciteChip scale="s" kind="brand" appearance="outline-fill">
                    {positionLabel(activeRefReach.damPosition)}
                  </CalciteChip>
                  <CalciteChip scale="s" kind="neutral" appearance="outline">
                    UPA {activeRefReach.upstreamAreaKm2.toFixed(0)} km²
                  </CalciteChip>
                </div>
              )}

              {activeRefReach && activeRefReach.damPosition !== 'upstream_masinga' && (
                <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
                  <div slot="message">
                    Selected reach is {positionLabel(activeRefReach.damPosition)} — do not treat cascade or downstream reaches as natural inflow into Masinga Dam.
                  </div>
                </CalciteNotice>
              )}

              {refLoading ? (
                <CalciteLoader inline scale="s" label="Fetching GEOGLOWS reference forecast" />
              ) : refError ? (
                <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
                  <div slot="message">{refError}</div>
                </CalciteNotice>
              ) : refForecast && forecast15DayMean !== null ? (
                <div className="flex flex-col gap-2">
                  <div
                    className="p-2 rounded grid grid-cols-2 gap-1.5 tabular-nums"
                    style={{
                      backgroundColor: 'var(--calcite-color-foreground-2)',
                      border: '1px solid var(--calcite-color-border-3)',
                      fontFamily: 'var(--calcite-code-family)',
                    }}
                  >
                    <div>15d Mean (Med): {forecast15DayMean.toFixed(1)} m³/s</div>
                    <div>Peak Median: {refForecast.peakStats.peakMedianM3s?.toFixed(1) ?? '—'} m³/s</div>
                  </div>
                  <CalciteButton
                    scale="s"
                    appearance="outline"
                    iconStart="arrow-down"
                    onClick={() => {
                      const clamped = Math.min(600, Math.max(10, Math.round(forecast15DayMean / 5) * 5));
                      updateA({ inflowM3s: clamped });
                    }}
                  >
                    Copy 15d Mean ({Math.round(forecast15DayMean)} m³/s) into Hypothetical Scenario A
                  </CalciteButton>
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ color: 'var(--calcite-color-text-3)' }}>
              GEOGLOWS Reach Index loading...
            </div>
          )}
        </div>
      </CalciteBlock>

      {/* Hypothetical Controls */}
      <CalciteBlock
        open
        heading="Scenario A Controls (Hypothetical Inputs)"
        data-demo-target="dam-controls"
        data-voice-hint="These scenario inputs are hypothetical and are not connected to KenGen SCADA. A selected river reach discharge is not a measured reservoir inflow."
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <CalciteLabel scale="s" className="flex-1 mb-0">
              Load Illustrative Preset
              <CalciteSelect
                scale="s"
                label="Select scenario preset"
                value={scenarioA.id}
                onCalciteSelectChange={(e) => {
                  applyPreset(String((e.target as HTMLCalciteSelectElement).value));
                }}
              >
                {ILLUSTRATIVE_DAM_PRESETS.map((p) => (
                  <CalciteOption key={p.id} value={p.id} selected={p.id === scenarioA.id}>
                    {p.label}
                  </CalciteOption>
                ))}
              </CalciteSelect>
            </CalciteLabel>
            <CalciteButton
              scale="s"
              appearance="outline"
              iconStart="reset"
              onClick={handleReset}
            >
              Reset
            </CalciteButton>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Scenario Evaluation Window</span>
              <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                {scenarioA.days} days
              </span>
            </div>
            <CalciteSlider
              min={7}
              max={90}
              step={1}
              value={scenarioA.days}
              label="Scenario evaluation days"
              onCalciteSliderInput={(e) =>
                updateA({ days: Number((e.target as HTMLCalciteSliderElement).value) })
              }
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Initial Storage (Hypothetical)</span>
              <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                {scenarioA.initialStorageMcm} / {scenarioA.capacityMcm} MCM (
                {Math.round((scenarioA.initialStorageMcm / scenarioA.capacityMcm) * 100)}%)
              </span>
            </div>
            <CalciteSlider
              min={180}
              max={1560}
              step={20}
              value={scenarioA.initialStorageMcm}
              label="Initial reservoir storage MCM"
              onCalciteSliderInput={(e) =>
                updateA({ initialStorageMcm: Number((e.target as HTMLCalciteSliderElement).value) })
              }
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Hypothetical Catchment Inflow</span>
              <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                {scenarioA.inflowM3s} m³/s
              </span>
            </div>
            <CalciteSlider
              min={10}
              max={600}
              step={5}
              value={scenarioA.inflowM3s}
              label="Catchment inflow m3/s"
              onCalciteSliderInput={(e) =>
                updateA({ inflowM3s: Number((e.target as HTMLCalciteSliderElement).value) })
              }
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Proposed Turbine / Gate Release</span>
              <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                {scenarioA.proposedReleaseM3s} m³/s
              </span>
            </div>
            <CalciteSlider
              min={20}
              max={450}
              step={5}
              value={scenarioA.proposedReleaseM3s}
              label="Proposed release m3/s"
              onCalciteSliderInput={(e) =>
                updateA({ proposedReleaseM3s: Number((e.target as HTMLCalciteSliderElement).value) })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Downstream Tribs</span>
                <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                  {scenarioA.downstreamTributaryM3s} m³/s
                </span>
              </div>
              <CalciteSlider
                min={0}
                max={200}
                step={5}
                value={scenarioA.downstreamTributaryM3s}
                label="Downstream tributary inflow"
                onCalciteSliderInput={(e) =>
                  updateA({
                    downstreamTributaryM3s: Number((e.target as HTMLCalciteSliderElement).value),
                  })
                }
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Cascade Attenuation</span>
                <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                  {scenarioA.attenuationPct}%
                </span>
              </div>
              <CalciteSlider
                min={0}
                max={40}
                step={2}
                value={scenarioA.attenuationPct}
                label="Downstream routing attenuation percent"
                onCalciteSliderInput={(e) =>
                  updateA({ attenuationPct: Number((e.target as HTMLCalciteSliderElement).value) })
                }
              />
            </div>
          </div>

          <CalciteButton
            scale="s"
            appearance="outline"
            width="full"
            onClick={() => setScenarioB({ ...scenarioA, name: 'Saved Baseline Snapshot' })}
          >
            Save Current Inputs as Comparison Scenario B
          </CalciteButton>
        </div>
      </CalciteBlock>

      {/* Calculated Scenario Outputs */}
      <CalciteBlock open heading={`Calculated ${scenarioA.days}-Day Scenario Outputs (Illustrative)`}>
        <div className="flex flex-col gap-2.5 text-xs">
          <CalciteCard scale="s">
            <span slot="heading">End Storage ({scenarioA.days}d)</span>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span
                className="text-base font-semibold tabular-nums"
                style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-text-1)' }}
              >
                {resultA.remainingStorageMcm.toFixed(1)} MCM
              </span>
              <CalciteChip
                scale="s"
                kind={storageMeta.kind}
                appearance="outline-fill"
                icon={storageMeta.icon}
                style={{
                  '--calcite-chip-border-color': storageMeta.token,
                  '--calcite-chip-icon-color': storageMeta.token,
                } as CSSProperties}
              >
                {resultA.storageRiskStatus} ({resultA.fillPct.toFixed(1)}%)
              </CalciteChip>
            </div>
            <CalciteMeter
              scale="s"
              label="Simulated reservoir fill percentage"
              min={0}
              max={100}
              low={25}
              high={85}
              value={resultA.fillPct}
              fillType="range"
              valueLabel
            />
          </CalciteCard>

          <div className="grid grid-cols-2 gap-2">
            <CalciteCard scale="s">
              <span slot="heading">Combined Corridor Flow</span>
              <div
                className="text-base font-semibold tabular-nums mb-1"
                style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-text-1)' }}
              >
                {resultA.downstreamAtOutletM3s.toFixed(1)} m³/s
              </div>
              <CalciteChip
                scale="s"
                kind={downstreamMeta.kind}
                appearance="outline-fill"
                icon={downstreamMeta.icon}
                style={{
                  '--calcite-chip-border-color': downstreamMeta.token,
                  '--calcite-chip-icon-color': downstreamMeta.token,
                } as CSSProperties}
              >
                {resultA.downstreamStatus}
              </CalciteChip>
            </CalciteCard>

            <CalciteCard scale="s">
              <span slot="heading">Uncontrolled Spill</span>
              <div
                className="text-base font-semibold tabular-nums"
                style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-text-1)' }}
              >
                {resultA.spillMcm.toFixed(1)} MCM
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--calcite-color-text-3)' }}>
                Evap: {resultA.evapLossMcm.toFixed(1)} MCM · Deficit: {resultA.deficitMcm.toFixed(1)} MCM
              </div>
            </CalciteCard>
          </div>
        </div>
      </CalciteBlock>

      {/* Release Strategy Trade-off & ±25% Inflow Sensitivity */}
      <CalciteBlock
        open
        heading="Release Trade-Off & ±25% Inflow Sensitivity"
        description="Illustrative operational options over the active evaluation horizon"
      >
        <div className="flex flex-col gap-2.5 text-xs">
          <CalciteCard scale="s">
            <p className="m-0 leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
              {tradeoffs.tradeOffSummary}
            </p>
          </CalciteCard>

          <CalciteTable caption="Lower / Baseline / Higher Release Comparison" scale="s" bordered striped>
            <CalciteTableRow slot="table-header">
              <CalciteTableHeader heading="Strategy" />
              <CalciteTableHeader heading="Rel. (m³/s)" />
              <CalciteTableHeader heading="Fill (%)" />
              <CalciteTableHeader heading="Spill (MCM)" />
              <CalciteTableHeader heading="Outflow" />
            </CalciteTableRow>
            {[tradeoffs.lowRelease, tradeoffs.baselineRelease, tradeoffs.highRelease].map((row) => (
              <CalciteTableRow key={row.params.id}>
                <CalciteTableCell>{row.params.name}</CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.params.proposedReleaseM3s}
                  </span>
                </CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.fillPct.toFixed(1)}%
                  </span>
                </CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.spillMcm.toFixed(1)}
                  </span>
                </CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.downstreamAtOutletM3s.toFixed(0)} m³/s
                  </span>
                </CalciteTableCell>
              </CalciteTableRow>
            ))}
          </CalciteTable>

          <CalciteTable caption="±25% Inflow Sensitivity Envelope" scale="s" bordered striped>
            <CalciteTableRow slot="table-header">
              <CalciteTableHeader heading="Inflow Sensitivity" />
              <CalciteTableHeader heading="Inflow" />
              <CalciteTableHeader heading="End Fill" />
              <CalciteTableHeader heading="Spill (MCM)" />
            </CalciteTableRow>
            {[tradeoffs.inflowLow25, tradeoffs.baselineRelease, tradeoffs.inflowHigh25].map((row) => (
              <CalciteTableRow key={row.params.id}>
                <CalciteTableCell>{row.params.name}</CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.params.inflowM3s} m³/s
                  </span>
                </CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.fillPct.toFixed(1)}%
                  </span>
                </CalciteTableCell>
                <CalciteTableCell>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {row.spillMcm.toFixed(1)}
                  </span>
                </CalciteTableCell>
              </CalciteTableRow>
            ))}
          </CalciteTable>
        </div>
      </CalciteBlock>

      {/* 6-Month Illustrative Trajectory Chart */}
      <CalciteBlock open heading="6-Month Storage Trajectory (Scenario A vs B)">
        <CalciteCard scale="s">
          <svg viewBox="0 0 340 145" className="w-full h-auto" role="img" aria-label="6-month hypothetical reservoir storage trajectory chart">
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = 115 - frac * 95;
              return (
                <g key={frac}>
                  <line x1="38" y1={y} x2="328" y2={y} stroke="var(--calcite-color-border-2)" strokeWidth="0.7" />
                  <text
                    x="34"
                    y={y + 3}
                    textAnchor="end"
                    fontSize="8"
                    fill="var(--calcite-color-text-3)"
                    style={{ fontFamily: 'var(--calcite-code-family)' }}
                  >
                    {Math.round(frac * maxCap)}
                  </text>
                </g>
              );
            })}
            <line
              x1="38"
              y1={115 - (scenarioA.deadStorageMcm / maxCap) * 95}
              x2="328"
              y2={115 - (scenarioA.deadStorageMcm / maxCap) * 95}
              stroke="var(--calcite-color-status-danger)"
              strokeDasharray="3 2"
              strokeWidth="1"
            />
            <polyline
              fill="none"
              stroke="var(--calcite-color-text-3)"
              strokeWidth="2"
              strokeDasharray="4 2"
              points={resultB.projection
                .map((step, i) => {
                  const x = 56 + i * 50;
                  const y = 115 - (step.endStorageMcm / maxCap) * 95;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            <polyline
              fill="none"
              stroke="var(--calcite-color-brand)"
              strokeWidth="2.5"
              points={resultA.projection
                .map((step, i) => {
                  const x = 56 + i * 50;
                  const y = 115 - (step.endStorageMcm / maxCap) * 95;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            {resultA.projection.map((step, i) => {
              const x = 56 + i * 50;
              const y = 115 - (step.endStorageMcm / maxCap) * 95;
              return (
                <g key={step.label}>
                  <circle cx={x} cy={y} r="3.5" fill="var(--calcite-color-brand)">
                    <title>{`${step.label}: ${step.endStorageMcm.toFixed(0)} MCM (${step.fillPct.toFixed(0)}%)`}</title>
                  </circle>
                  <text x={x} y="130" textAnchor="middle" fontSize="8" fill="var(--calcite-color-text-1)">
                    M+{step.monthIndex}
                  </text>
                </g>
              );
            })}
            <text x="184" y="142" textAnchor="middle" fontSize="7.5" fill="var(--calcite-color-text-3)">
              Solid blue = Scenario A · Dashed = Scenario B · Red = Dead storage (180 MCM)
            </text>
          </svg>
        </CalciteCard>
      </CalciteBlock>

      {/* Tana Cascade Asset Context */}
      <CalciteBlock collapsible heading="Upper Tana Cascade & Routing Context">
        <div className="flex flex-col gap-2 text-xs">
          {TANA_HYDROPOWER_ASSETS.map((asset) => (
            <CalciteCard key={asset.name} scale="s">
              <span slot="heading">{asset.name}</span>
              <span slot="description">{asset.role}</span>
              <div style={{ color: 'var(--calcite-color-text-2)' }}>
                <div>{asset.capacityNote}</div>
                <div className="mt-1" style={{ color: 'var(--calcite-color-text-3)' }}>
                  {asset.scopeNote}
                </div>
              </div>
            </CalciteCard>
          ))}
        </div>
      </CalciteBlock>
    </div>
  );
}
