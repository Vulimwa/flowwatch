import { useEffect, useMemo, useState } from 'react';
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
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
  CalciteSelect,
  CalciteTab,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTable,
  CalciteTableCell,
  CalciteTableHeader,
  CalciteTableRow,
  CalciteTabs,
} from '@esri/calcite-components-react';

import { evaluateCatchmentSignalConsistency } from '../../analytics/catchmentConsistency';
import { DATASET_BY_ID } from '../../config/dataRegistry';
import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import { fetchGeoTiffTimeSeries } from '../../services/raster/rasterService';
import type {
  AppModuleId,
  BasinZonalStatsResponse,
  GeoglowsReachRecord,
  RasterTimeSeriesResult,
  StreamflowAnalysisResult,
  SubBasinPolygon,
} from '../../types/geospatial';

interface CatchmentResponseWorkspaceProps {
  layersState: Record<string, LayerRuntimeState>;
  onActivateLayer: (datasetId: string, band?: number) => void;
  onChangeBand: (datasetId: string, band: number) => void;
  subBasins: SubBasinPolygon[];
  selectedHybasId: number | 'all';
  onSelectHybasId: (id: number | 'all', zoom?: boolean) => void;
  zonalStats: BasinZonalStatsResponse | null;
  zonalLoading: boolean;
  selectedReach: GeoglowsReachRecord | null;
  streamflowAnalysis: StreamflowAnalysisResult | null;
  onOpenIndicatorInfo: (indicatorId: string) => void;
  onNavigateWorkspace: (id: AppModuleId) => void;
}

const CLIMATE_DATASET_IDS = [
  'chirps_anomaly_2026',
  'chirps_seasonal_2026',
  'chirps_seasonal_clim',
  'chirps_monthly_2026',
  'chirps_monthly_clim',
  'chirps_annual_stats',
  'chirps_annual_2001_2025',
  'chirps_anomaly_2026_viz',
] as const;

const SOIL_DATASET_IDS = [
  'era5_sm_anomaly_2026',
  'era5_sm_recent_2026',
  'era5_sm_baseline',
  'era5_temperature_2026',
  'era5_pet_2026',
  'era5_sm_anomaly_2026_viz',
] as const;

const TERRAIN_DATASET_IDS = [
  'dem',
  'slope',
  'flow_accumulation',
  'flow_direction',
  'stream_network_upa100',
  'hand',
  'dem_viz',
] as const;

export function CatchmentResponseWorkspace({
  layersState,
  onActivateLayer,
  onChangeBand,
  subBasins,
  selectedHybasId,
  onSelectHybasId,
  zonalStats,
  zonalLoading,
  selectedReach,
  streamflowAnalysis,
  onOpenIndicatorInfo,
  onNavigateWorkspace,
}: CatchmentResponseWorkspaceProps) {
  const [climateId, setClimateId] = useState<string>('chirps_anomaly_2026');
  const [soilId, setSoilId] = useState<string>('era5_sm_anomaly_2026');
  const [terrainId, setTerrainId] = useState<string>('dem');
  const [rainChartMode, setRainChartMode] = useState<'monthly' | 'annual'>('monthly');

  const [annualSeries, setAnnualSeries] = useState<RasterTimeSeriesResult | null>(null);
  const [recentSm, setRecentSm] = useState<RasterTimeSeriesResult | null>(null);
  const [baseSm, setBaseSm] = useState<RasterTimeSeriesResult | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingExtra(true);
    Promise.allSettled([
      fetchGeoTiffTimeSeries(DATASET_BY_ID.chirps_annual_2001_2025.itemId),
      fetchGeoTiffTimeSeries(DATASET_BY_ID.era5_sm_recent_2026.itemId),
      fetchGeoTiffTimeSeries(DATASET_BY_ID.era5_sm_baseline.itemId),
    ]).then(([a, r, b]) => {
      if (cancelled) return;
      if (a.status === 'fulfilled') setAnnualSeries(a.value);
      if (r.status === 'fulfilled') setRecentSm(r.value);
      if (b.status === 'fulfilled') setBaseSm(b.value);
      setLoadingExtra(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeZonal = useMemo(() => {
    if (!zonalStats) return null;
    if (selectedHybasId === 'all') return zonalStats.basinWide;
    return (
      zonalStats.bySubBasin.find((b) => b.hybasId === selectedHybasId) || zonalStats.basinWide
    );
  }, [zonalStats, selectedHybasId]);

  const consistency = useMemo(
    () =>
      evaluateCatchmentSignalConsistency(
        activeZonal,
        streamflowAnalysis,
        selectedReach?.displayName
      ),
    [activeZonal, streamflowAnalysis, selectedReach]
  );

  const consistencyColor =
    consistency.classification === 'Consistent'
      ? 'var(--calcite-color-status-success)'
      : consistency.classification === 'Contradictory'
      ? 'var(--calcite-color-status-danger)'
      : 'var(--calcite-color-status-warning)';

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon26 = activeZonal?.chirpsMonthly2026Means || Array(12).fill(null);
  const monClim = activeZonal?.chirpsMonthlyClimMeans || Array(12).fill(null);
  const maxMonthlyVal = Math.max(
    10,
    ...mon26.filter((v): v is number => v !== null),
    ...monClim.filter((v): v is number => v !== null)
  );

  const annualMeans =
    annualSeries?.bands?.map((b, idx) => ({
      year: 2001 + idx,
      mean: b.stats?.mean ?? 0,
    })) || [];
  const maxAnnualVal = Math.max(100, ...annualMeans.map((d) => d.mean));
  const avg25yr =
    annualMeans.length > 0
      ? annualMeans.reduce((s, d) => s + d.mean, 0) / annualMeans.length
      : 0;

  const activeClimateDs = DATASET_BY_ID[climateId];
  const activeSoilDs = DATASET_BY_ID[soilId];

  const depthLabels = [
    'L1 (0–7 cm)',
    'L2 (7–28 cm)',
    'L3 (28–100 cm)',
    'L4 (100–289 cm)',
    'Root Zone (0–100 cm)',
  ];

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Sub-Basin Focus Filter */}
      <CalciteBlock
        open
        heading="Sub-Basin Analytical Scope"
        description="Polygon-masked zonal extraction across HydroBASINS Level-7 Upper Tana polygons"
      >
        <div className="flex flex-col gap-2">
          <CalciteLabel scale="s" className="mb-0">
            Active Sub-Basin Polygon
            <CalciteSelect
              scale="s"
              label="Select sub-basin polygon"
              value={String(selectedHybasId)}
              onCalciteSelectChange={(e) => {
                const raw = String((e.target as HTMLCalciteSelectElement).value);
                onSelectHybasId(raw === 'all' ? 'all' : Number(raw), true);
              }}
            >
              <CalciteOption value="all" selected={selectedHybasId === 'all'}>
                All 5 Upper Tana Sub-Basins (~22,458 km²)
              </CalciteOption>
              {subBasins.map((sb) => (
                <CalciteOption
                  key={sb.hybasId}
                  value={String(sb.hybasId)}
                  selected={selectedHybasId === sb.hybasId}
                >
                  {sb.name} ({Math.round(sb.subAreaKm2).toLocaleString()} km²)
                </CalciteOption>
              ))}
            </CalciteSelect>
          </CalciteLabel>

          {/* Hydrological Signal Consistency Card (No Fake Composite Index) */}
          <CalciteCard scale="s">
            <span slot="heading">Catchment Signal Consistency Check</span>
            <span slot="description">{activeZonal?.name || 'Loading zonal metrics...'}</span>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CalciteChip
                  scale="s"
                  kind="neutral"
                  appearance="outline-fill"
                  style={{ '--calcite-chip-border-color': consistencyColor } as React.CSSProperties}
                >
                  {consistency.classification}
                </CalciteChip>
                <CalciteButton
                  scale="s"
                  appearance="transparent"
                  iconStart="information"
                  onClick={() => onOpenIndicatorInfo('ind_catchment_consistency')}
                >
                  Rule &amp; Caveats
                </CalciteButton>
              </div>
              <p className="m-0 leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
                {consistency.summary}
              </p>
              {consistency.checks.length > 0 && (
                <div className="flex flex-col gap-1">
                  {consistency.checks.map((c) => (
                    <div
                      key={c.indicator}
                      className="px-2 py-1 rounded flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: 'var(--calcite-color-foreground-2)',
                        border: '1px solid var(--calcite-color-border-3)',
                      }}
                    >
                      <span className="truncate">{c.indicator}</span>
                      <span
                        className="tabular-nums whitespace-nowrap font-medium"
                        style={{ fontFamily: 'var(--calcite-code-family)' }}
                      >
                        {c.observedValue}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {consistency.explanation.length > 0 && (
                <div style={{ color: 'var(--calcite-color-text-3)' }}>
                  {consistency.explanation.join(' ')}
                </div>
              )}
            </div>
          </CalciteCard>
        </div>
      </CalciteBlock>

      <CalciteTabs scale="s" layout="center">
        <CalciteTabNav slot="tab-nav">
          <CalciteTabTitle selected>Rainfall</CalciteTabTitle>
          <CalciteTabTitle>Soil &amp; PET</CalciteTabTitle>
          <CalciteTabTitle>Sub-Basins</CalciteTabTitle>
          <CalciteTabTitle>Terrain Routing</CalciteTabTitle>
        </CalciteTabNav>

        {/* TAB 1: CHIRPS RAINFALL & PARTIAL-YEAR SAFEGUARD */}
        <CalciteTab selected>
          <div className="pt-2.5 flex flex-col gap-2.5">
            <CalciteNotice open kind="warning" scale="s" icon="clock">
              <div slot="title">Incomplete 2026 Record (Jan–Sep Only)</div>
              <div slot="message">
                2026 CHIRPS excludes Oct–Dec (OND Short Rains). All comparisons below match Jan–Sep 2026 against the identical Jan–Sep 2001–2025 window. Rainfall anomalies are NOT flood events.
              </div>
            </CalciteNotice>

            <div className="flex flex-col gap-2">
              <CalciteLabel scale="s" className="mb-0">
                CHIRPS Rainfall Layer on Map
                <CalciteSelect
                  scale="s"
                  label="Select CHIRPS layer"
                  value={climateId}
                  onCalciteSelectChange={(e) => {
                    const id = String((e.target as HTMLCalciteSelectElement).value);
                    setClimateId(id);
                    onActivateLayer(id);
                  }}
                >
                  {CLIMATE_DATASET_IDS.map((id) => (
                    <CalciteOption key={id} value={id} selected={id === climateId}>
                      {DATASET_BY_ID[id].shortTitle}
                    </CalciteOption>
                  ))}
                </CalciteSelect>
              </CalciteLabel>

              {activeClimateDs?.bands && activeClimateDs.bands.length > 1 && (
                <CalciteLabel scale="s" className="mb-0">
                  Band / Season / Year
                  <CalciteSelect
                    scale="s"
                    label="Select CHIRPS band"
                    value={String(layersState[climateId]?.band ?? activeClimateDs.defaultBand ?? 0)}
                    onCalciteSelectChange={(e) =>
                      onChangeBand(climateId, Number((e.target as HTMLCalciteSelectElement).value))
                    }
                  >
                    {activeClimateDs.bands.map((b) => (
                      <CalciteOption
                        key={b.code}
                        value={String(b.index)}
                        selected={
                          b.index === (layersState[climateId]?.band ?? activeClimateDs.defaultBand ?? 0)
                        }
                      >
                        {b.label}
                      </CalciteOption>
                    ))}
                  </CalciteSelect>
                </CalciteLabel>
              )}
            </div>

            {zonalLoading ? (
              <div className="py-4 flex justify-center">
                <CalciteLoader scale="m" label="Computing CHIRPS zonal statistics" />
              </div>
            ) : activeZonal ? (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <CalciteCard scale="s">
                  <span slot="heading">2026 Jan–Sep</span>
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.chirpsYtd2026Mm.mean?.toFixed(0) ?? '—'} mm
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">Base Jan–Sep</span>
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.chirpsYtdBaselineMm.mean?.toFixed(0) ?? '—'} mm
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">Anomaly (%)</span>
                  <div
                    className="text-sm font-semibold tabular-nums"
                    style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-brand)' }}
                  >
                    {activeZonal.chirpsAnomPct.mean !== null
                      ? `${activeZonal.chirpsAnomPct.mean >= 0 ? '+' : ''}${activeZonal.chirpsAnomPct.mean.toFixed(1)}%`
                      : '—'}
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>
                    z = {activeZonal.chirpsAnomZ.mean?.toFixed(2) ?? '—'}
                  </div>
                </CalciteCard>
              </div>
            ) : null}

            <CalciteSegmentedControl
              scale="s"
              width="full"
              onCalciteSegmentedControlChange={(e) =>
                setRainChartMode((e.target as HTMLCalciteSegmentedControlElement).value as 'monthly' | 'annual')
              }
            >
              <CalciteSegmentedControlItem value="monthly" checked={rainChartMode === 'monthly'}>
                2026 vs 2001–2025 Monthly
              </CalciteSegmentedControlItem>
              <CalciteSegmentedControlItem value="annual" checked={rainChartMode === 'annual'}>
                2001–2025 Annual Archive
              </CalciteSegmentedControlItem>
            </CalciteSegmentedControl>

            {rainChartMode === 'monthly' ? (
              <CalciteCard scale="s">
                <svg viewBox="0 0 340 165" className="w-full h-auto" role="img" aria-label="Monthly 2026 versus 2001-2025 rainfall for selected sub-basin">
                  {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = 130 - frac * 110;
                    return (
                      <g key={frac}>
                        <line x1="34" y1={y} x2="332" y2={y} stroke="var(--calcite-color-border-2)" strokeWidth="0.7" />
                        <text x="30" y={y + 3} textAnchor="end" fontSize="8" fill="var(--calcite-color-text-3)" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {Math.round(frac * maxMonthlyVal)}
                        </text>
                      </g>
                    );
                  })}
                  {monthNames.map((m, idx) => {
                    const xBase = 38 + idx * 24.5;
                    const cVal = monClim[idx];
                    const rVal = mon26[idx];
                    const cH = cVal !== null ? (cVal / maxMonthlyVal) * 110 : 0;
                    const rH = rVal !== null ? (rVal / maxMonthlyVal) * 110 : 0;
                    return (
                      <g key={m}>
                        {cVal !== null && (
                          <rect x={xBase} y={130 - cH} width="9" height={cH} fill="var(--calcite-color-text-3)" rx="1">
                            <title>{`${m} Base: ${cVal.toFixed(1)} mm`}</title>
                          </rect>
                        )}
                        {rVal !== null && (
                          <rect x={xBase + 10} y={130 - rH} width="9" height={rH} fill="var(--calcite-color-brand)" rx="1">
                            <title>{`${m} 2026: ${rVal.toFixed(1)} mm`}</title>
                          </rect>
                        )}
                        <text x={xBase + 9} y="144" textAnchor="middle" fontSize="7.5" fill="var(--calcite-color-text-1)">
                          {m}
                        </text>
                      </g>
                    );
                  })}
                  <text x="180" y="158" textAnchor="middle" fontSize="8" fill="var(--calcite-color-text-3)">
                    Polygon zonal mean (mm/month) · Oct–Dec 2026 absent
                  </text>
                </svg>
              </CalciteCard>
            ) : (
              <CalciteCard scale="s">
                <svg viewBox="0 0 340 165" className="w-full h-auto" role="img" aria-label="2001 to 2025 annual rainfall archive">
                  {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = 130 - frac * 110;
                    return (
                      <g key={frac}>
                        <line x1="36" y1={y} x2="332" y2={y} stroke="var(--calcite-color-border-2)" strokeWidth="0.7" />
                        <text x="32" y={y + 3} textAnchor="end" fontSize="8" fill="var(--calcite-color-text-3)" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {Math.round(frac * maxAnnualVal)}
                        </text>
                      </g>
                    );
                  })}
                  {avg25yr > 0 && (
                    <line
                      x1="36"
                      y1={130 - (avg25yr / maxAnnualVal) * 110}
                      x2="332"
                      y2={130 - (avg25yr / maxAnnualVal) * 110}
                      stroke="var(--calcite-color-status-warning)"
                      strokeDasharray="3 2"
                      strokeWidth="1.2"
                    />
                  )}
                  {annualMeans.map((item, idx) => {
                    const x = 40 + idx * 11.6;
                    const h = (item.mean / maxAnnualVal) * 110;
                    return (
                      <g
                        key={item.year}
                        className="cursor-pointer"
                        onClick={() => onActivateLayer('chirps_annual_2001_2025', idx)}
                      >
                        <rect
                          x={x}
                          y={130 - h}
                          width="8.5"
                          height={h}
                          fill={item.mean >= avg25yr ? 'var(--calcite-color-brand)' : 'var(--calcite-color-text-3)'}
                          rx="1"
                        >
                          <title>{`${item.year}: ${item.mean.toFixed(0)} mm`}</title>
                        </rect>
                        {idx % 4 === 0 && (
                          <text x={x + 4} y="143" textAnchor="middle" fontSize="7.5" fill="var(--calcite-color-text-1)">
                            {String(item.year).slice(2)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text x="184" y="158" textAnchor="middle" fontSize="8" fill="var(--calcite-color-text-3)">
                    Click bar to map annual CHIRPS · Dashed = 25-yr mean ({avg25yr.toFixed(0)} mm)
                  </text>
                </svg>
              </CalciteCard>
            )}
          </div>
        </CalciteTab>

        {/* TAB 2: SOIL MOISTURE & PET ATMOSPHERIC DEMAND */}
        <CalciteTab>
          <div className="pt-2.5 flex flex-col gap-2.5">
            <CalciteNotice open kind="info" scale="s" icon="information">
              <div slot="title">ERA5-Land Soil Moisture &amp; PET Guardrails</div>
              <div slot="message">
                PET quantifies atmospheric evaporative demand—NOT actual vegetation evapotranspiration. Coarse 0.10° (~11 km) cells smooth narrow valleys.
              </div>
            </CalciteNotice>

            <CalciteLabel scale="s" className="mb-0">
              ERA5-Land Layer on Map
              <CalciteSelect
                scale="s"
                label="Select ERA5 layer"
                value={soilId}
                onCalciteSelectChange={(e) => {
                  const id = String((e.target as HTMLCalciteSelectElement).value);
                  setSoilId(id);
                  onActivateLayer(id);
                }}
              >
                {SOIL_DATASET_IDS.map((id) => (
                  <CalciteOption key={id} value={id} selected={id === soilId}>
                    {DATASET_BY_ID[id].shortTitle}
                  </CalciteOption>
                ))}
              </CalciteSelect>
            </CalciteLabel>

            {activeSoilDs?.bands && activeSoilDs.bands.length > 1 && (
              <CalciteLabel scale="s" className="mb-0">
                Depth / Variable Band
                <CalciteSelect
                  scale="s"
                  label="Select ERA5 band"
                  value={String(layersState[soilId]?.band ?? activeSoilDs.defaultBand ?? 0)}
                  onCalciteSelectChange={(e) =>
                    onChangeBand(soilId, Number((e.target as HTMLCalciteSelectElement).value))
                  }
                >
                  {activeSoilDs.bands.map((b) => (
                    <CalciteOption
                      key={b.code}
                      value={String(b.index)}
                      selected={b.index === (layersState[soilId]?.band ?? activeSoilDs.defaultBand ?? 0)}
                    >
                      {b.label}
                    </CalciteOption>
                  ))}
                </CalciteSelect>
              </CalciteLabel>
            )}

            {activeZonal && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <CalciteCard scale="s">
                  <span slot="heading">Root-Zone SM (0–100 cm)</span>
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.era5SmRootZone2026.mean?.toFixed(4) ?? '—'} m³/m³
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>
                    Anom: {activeZonal.era5SmRootZoneAnom.mean !== null
                      ? `${activeZonal.era5SmRootZoneAnom.mean >= 0 ? '+' : ''}${activeZonal.era5SmRootZoneAnom.mean.toFixed(4)}`
                      : '—'}{' '}
                    (z = {activeZonal.era5SmRootZoneZ.mean?.toFixed(2) ?? '—'})
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">PET (Atmos. Demand)</span>
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.era5Pet2026MmDay.mean?.toFixed(2) ?? '—'} mm/d
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>
                    Base: {activeZonal.era5PetBaseMmDay.mean?.toFixed(2) ?? '—'} · Temp:{' '}
                    {activeZonal.era5Temp2026C.mean?.toFixed(1) ?? '—'} °C
                  </div>
                </CalciteCard>
              </div>
            )}

            {loadingExtra ? (
              <CalciteLoader inline scale="s" label="Loading soil profile depths" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {depthLabels.map((lbl, idx) => {
                  const rMean = recentSm?.bands?.[idx]?.stats?.mean;
                  const bMean = baseSm?.bands?.[idx]?.stats?.mean;
                  return (
                    <CalciteCard key={lbl} scale="s">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{lbl}</span>
                        <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {rMean?.toFixed(4) ?? '—'} / base {bMean?.toFixed(4) ?? '—'} m³/m³
                        </span>
                      </div>
                      {rMean !== undefined && (
                        <CalciteMeter scale="s" label={lbl} min={0} max={0.55} value={rMean} fillType="single" />
                      )}
                    </CalciteCard>
                  );
                })}
              </div>
            )}
          </div>
        </CalciteTab>

        {/* TAB 3: SUB-BASIN COMPARISON TABLE (5 HYDROBASINS L7 POLYGONS) */}
        <CalciteTab>
          <div className="pt-2.5 flex flex-col gap-2.5">
            {zonalStats ? (
              <div className="overflow-x-auto">
                <CalciteTable
                  caption="Upper Tana HydroBASINS Level-7 Polygon Zonal Comparison"
                  scale="s"
                  bordered
                  striped
                >
                  <CalciteTableRow slot="table-header">
                    <CalciteTableHeader heading="Sub-Basin (Click to Focus)" />
                    <CalciteTableHeader heading="CHIRPS Anom" />
                    <CalciteTableHeader heading="SM Root Anom" />
                    <CalciteTableHeader heading="PET (mm/d)" />
                  </CalciteTableRow>
                  {zonalStats.bySubBasin.map((row) => (
                    <CalciteTableRow
                      key={String(row.hybasId)}
                      selected={row.hybasId === selectedHybasId}
                      onClick={() => onSelectHybasId(row.hybasId, true)}
                    >
                      <CalciteTableCell>
                        <div className="text-xs font-medium">{row.name}</div>
                        <div className="text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
                          {Math.round(row.subAreaKm2).toLocaleString()} km² · Elev{' '}
                          {row.demElevationM.mean?.toFixed(0) ?? '—'} m
                        </div>
                      </CalciteTableCell>
                      <CalciteTableCell>
                        <span className="tabular-nums text-xs" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {row.chirpsAnomPct.mean !== null
                            ? `${row.chirpsAnomPct.mean >= 0 ? '+' : ''}${row.chirpsAnomPct.mean.toFixed(1)}%`
                            : '—'}
                        </span>
                      </CalciteTableCell>
                      <CalciteTableCell>
                        <span className="tabular-nums text-xs" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {row.era5SmRootZoneAnom.mean !== null
                            ? `${row.era5SmRootZoneAnom.mean >= 0 ? '+' : ''}${row.era5SmRootZoneAnom.mean.toFixed(4)}`
                            : '—'}
                        </span>
                      </CalciteTableCell>
                      <CalciteTableCell>
                        <span className="tabular-nums text-xs" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {row.era5Pet2026MmDay.mean?.toFixed(2) ?? '—'}
                        </span>
                      </CalciteTableCell>
                    </CalciteTableRow>
                  ))}
                </CalciteTable>
              </div>
            ) : (
              <CalciteLoader scale="s" label="Loading sub-basin zonal comparison" />
            )}

            <CalciteButton
              scale="s"
              appearance="outline"
              width="full"
              iconStart="layer-stream"
              onClick={() => onNavigateWorkspace('streamflow')}
            >
              Inspect Active River Reach in Streamflow Intelligence
            </CalciteButton>
          </div>
        </CalciteTab>

        {/* TAB 4: TERRAIN ROUTING CONTEXT */}
        <CalciteTab>
          <div className="pt-2.5 flex flex-col gap-2.5">
            <CalciteNotice open kind="info" scale="s" icon="information">
              <div slot="title">Terrain Context Guards</div>
              <div slot="message">
                Flow Accumulation (UPA km²) measures drainage convergence—NOT observed river discharge (m³/s). HAND measures relative height above channel—NOT calibrated flood depth.
              </div>
            </CalciteNotice>

            <CalciteLabel scale="s" className="mb-0">
              Terrain &amp; Drainage Raster Layer
              <CalciteSelect
                scale="s"
                label="Select terrain layer"
                value={terrainId}
                onCalciteSelectChange={(e) => {
                  const id = String((e.target as HTMLCalciteSelectElement).value);
                  setTerrainId(id);
                  onActivateLayer(id);
                }}
              >
                {TERRAIN_DATASET_IDS.map((id) => (
                  <CalciteOption key={id} value={id} selected={id === terrainId}>
                    {DATASET_BY_ID[id].shortTitle}
                  </CalciteOption>
                ))}
              </CalciteSelect>
            </CalciteLabel>

            {activeZonal && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <CalciteCard scale="s">
                  <span slot="heading">Mean Elev.</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.demElevationM.mean?.toFixed(0) ?? '—'} m
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">Mean Slope</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.slopeDeg.mean?.toFixed(1) ?? '—'}°
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">Mean HAND</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {activeZonal.handM.mean?.toFixed(1) ?? '—'} m
                  </div>
                </CalciteCard>
              </div>
            )}
          </div>
        </CalciteTab>
      </CalciteTabs>
    </div>
  );
}
