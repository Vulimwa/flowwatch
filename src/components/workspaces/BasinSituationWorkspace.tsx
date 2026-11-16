import { useMemo, useState, type CSSProperties } from 'react';
import {
  CalciteBlock,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteDialog,
  CalciteLabel,
  CalciteList,
  CalciteListItem,
  CalciteLoader,
  CalciteNotice,
  CalciteOption,
  CalciteSelect,
  CalciteTable,
  CalciteTableCell,
  CalciteTableHeader,
  CalciteTableRow,
} from '@esri/calcite-components-react';

import { evaluateCatchmentSignalConsistency } from '../../analytics/catchmentConsistency';
import {
  buildSituationAssessmentReport,
  downloadTextFile,
  reportToMarkdown,
} from '../../analytics/situationReportBuilder';
import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import type {
  AppModuleId,
  BasinZonalStatsResponse,
  DamScenarioResult,
  EnsoStatusResponse,
  ExposureScreeningResult,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
  StreamflowAnalysisResult,
  SubBasinPolygon,
  SupportingToolId,
} from '../../types/geospatial';

interface BasinSituationWorkspaceProps {
  subBasins: SubBasinPolygon[];
  selectedHybasId: number | 'all';
  onSelectHybasId: (id: number | 'all', zoom?: boolean) => void;
  zonalStats: BasinZonalStatsResponse | null;
  zonalLoading: boolean;
  ensoStatus: EnsoStatusResponse | null;
  ensoLoading: boolean;
  geoglowsIndex: GeoglowsReachIndexResponse | null;
  selectedLinkno: number | null;
  selectedReach: GeoglowsReachRecord | null;
  onSelectGeoglowsReach: (linkno: number, zoom?: boolean) => void;
  streamflowAnalysis: StreamflowAnalysisResult | null;
  exposureScreening: ExposureScreeningResult | null;
  damResult: DamScenarioResult | null;
  layersState: Record<string, LayerRuntimeState>;
  onActivateLayer: (datasetId: string, band?: number) => void;
  onToggleLayer: (datasetId: string, visible: boolean) => void;
  onNavigateWorkspace: (id: AppModuleId) => void;
  onOpenSupportingTool: (tool: SupportingToolId) => void;
  onOpenIndicatorInfo: (indicatorId: string) => void;
  onStartGuidedDemo: () => void;
}

const INVESTIGATION_STEPS: Array<{
  step: string;
  title: string;
  description: string;
  target: AppModuleId;
}> = [
  {
    step: '01',
    title: 'Basin & Sub-Basin Scope',
    description: 'Focus HydroBASINS L7 polygons (22,458 km² Upper Tana AOI)',
    target: 'basin_situation',
  },
  {
    step: '02',
    title: 'ENSO Global Context',
    description: 'Inspect NOAA CPC ONI phase & Tana seasonal caveat',
    target: 'catchment_response',
  },
  {
    step: '03',
    title: 'Catchment Rainfall & Soil Wetness',
    description: 'CHIRPS Jan–Sep 2026 anomaly + ERA5-Land root-zone SM & PET',
    target: 'catchment_response',
  },
  {
    step: '04',
    title: 'Cross-Signal Consistency',
    description: 'Compare rainfall, wetness, and discharge alignment without fake scores',
    target: 'catchment_response',
  },
  {
    step: '05',
    title: 'Streamflow Ensemble Forecast',
    description: 'GEOGLOWS 51-member spread vs separate 10d HRES & issue runs',
    target: 'streamflow',
  },
  {
    step: '06',
    title: 'Historical Rank & Return Periods',
    description: '1940–present percentiles & Gumbel RP exceedance hours',
    target: 'streamflow',
  },
  {
    step: '07',
    title: 'Corridor Proximity Exposure',
    description: '500 m–5 km buffer WorldPop, HAND <5 m, towns & health facilities',
    target: 'impact_exposure',
  },
  {
    step: '08',
    title: 'Water Operations Lab & Situation Export',
    description: 'Explore hypothetical Masinga release trade-offs & export evidence report',
    target: 'water_operations',
  },
];

export function BasinSituationWorkspace({
  subBasins,
  selectedHybasId,
  onSelectHybasId,
  zonalStats,
  zonalLoading,
  ensoStatus,
  ensoLoading,
  geoglowsIndex,
  selectedLinkno,
  selectedReach,
  onSelectGeoglowsReach,
  streamflowAnalysis,
  exposureScreening,
  damResult,
  layersState,
  onActivateLayer,
  onToggleLayer,
  onNavigateWorkspace,
  onOpenSupportingTool,
  onOpenIndicatorInfo,
  onStartGuidedDemo,
}: BasinSituationWorkspaceProps) {
  const [reportOpen, setReportOpen] = useState(false);

  const selectedSubBasin = useMemo(
    () =>
      selectedHybasId === 'all'
        ? null
        : subBasins.find((s) => s.hybasId === selectedHybasId) || null,
    [subBasins, selectedHybasId]
  );

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

  const situationReport = useMemo(
    () =>
      buildSituationAssessmentReport({
        selectedSubBasin,
        zonalStats,
        activeSubBasinZonal: activeZonal,
        enso: ensoStatus,
        selectedReach,
        streamflowAnalysis,
        signalConsistency: consistency,
        exposureScreening,
        damScenarioResult: damResult,
        damIsHypothetical: true,
      }),
    [
      selectedSubBasin,
      zonalStats,
      activeZonal,
      ensoStatus,
      selectedReach,
      streamflowAnalysis,
      consistency,
      exposureScreening,
      damResult,
    ]
  );

  const topReaches = useMemo(() => {
    if (!geoglowsIndex) return [];
    return [...geoglowsIndex.reaches]
      .sort((a, b) => b.upstreamAreaKm2 - a.upstreamAreaKm2)
      .slice(0, 12);
  }, [geoglowsIndex]);

  const ensoColor =
    ensoStatus?.latestSeason?.phase === 'El Niño'
      ? 'var(--calcite-color-status-warning)'
      : ensoStatus?.latestSeason?.phase === 'La Niña'
      ? 'var(--calcite-color-status-info)'
      : 'var(--calcite-color-status-success)';

  const consistencyColor =
    consistency.classification === 'Consistent'
      ? 'var(--calcite-color-status-success)'
      : consistency.classification === 'Contradictory'
      ? 'var(--calcite-color-status-danger)'
      : 'var(--calcite-color-status-warning)';

  const handleExportMd = () => {
    const md = reportToMarkdown(situationReport);
    downloadTextFile(
      `flowwatch-tana-situation-${new Date().toISOString().slice(0, 10)}.md`,
      md,
      'text/markdown;charset=utf-8'
    );
  };

  const handleExportJson = () => {
    downloadTextFile(
      `flowwatch-tana-situation-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(situationReport, null, 2),
      'application/json;charset=utf-8'
    );
  };

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Scope Bar & Live Report Export */}
      <CalciteCard scale="s">
        <span slot="heading">Upper Tana Basin Operational Scope</span>
        <span slot="description">
          5 HydroBASINS Level-7 polygons (~22,458 km²) · Analysis window: Jan–Sep 2026 vs 2001–2025
        </span>

        <div className="flex flex-col gap-2 text-xs">
          <CalciteLabel scale="s" className="mb-0">
            Sub-Basin Analytical Focus
            <CalciteSelect
              scale="s"
              label="Focus sub-basin polygon"
              value={String(selectedHybasId)}
              onCalciteSelectChange={(e) => {
                const raw = String((e.target as HTMLCalciteSelectElement).value);
                onSelectHybasId(raw === 'all' ? 'all' : Number(raw), true);
              }}
            >
              <CalciteOption value="all" selected={selectedHybasId === 'all'}>
                All 5 Upper Tana Sub-Basins (AOI Union)
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

          {topReaches.length > 0 && (
            <CalciteLabel scale="s" className="mb-0">
              Active Verified River Reach (GEOGLOWS LINKNO)
              <CalciteSelect
                scale="s"
                label="Select active GEOGLOWS reach"
                value={selectedLinkno ? String(selectedLinkno) : ''}
                onCalciteSelectChange={(e) => {
                  const id = Number((e.target as HTMLCalciteSelectElement).value);
                  if (Number.isFinite(id) && id > 0) onSelectGeoglowsReach(id, true);
                }}
              >
                {topReaches.map((r) => (
                  <CalciteOption key={r.linkno} value={String(r.linkno)} selected={r.linkno === selectedLinkno}>
                    {r.displayName} (LINKNO {r.linkno} · {r.upstreamAreaKm2.toFixed(0)} km²)
                  </CalciteOption>
                ))}
              </CalciteSelect>
            </CalciteLabel>
          )}
        </div>

        <CalciteButton
          className="mb-2"
          scale="s"
          kind="brand"
          iconStart="play"
          data-demo-target="workspace-navigation"
          onClick={onStartGuidedDemo}
        >
          Start Guided Demo
        </CalciteButton>
        <CalciteButton
          slot="footer-start"
          scale="s"
          appearance="outline"
          iconStart="file-text"
          onClick={() => setReportOpen(true)}
        >
          Generate Situation Report
        </CalciteButton>
        <CalciteButton
          slot="footer-end"
          scale="s"
          appearance="outline"
          iconStart="table"
          onClick={() => onOpenSupportingTool('indicators')}
        >
          Indicator Registry
        </CalciteButton>
      </CalciteCard>

      {/* CARD 1: LIVE ENSO CONTEXT (NOAA CPC ONI) */}
      <CalciteCard scale="s">
        <span slot="heading">1. ENSO Context (NOAA CPC ONI)</span>
        <span slot="description">ERSST.v5 Niño 3.4 3-Month Running Mean</span>

        {ensoLoading ? (
          <CalciteLoader inline scale="s" label="Fetching NOAA CPC ONI" />
        ) : ensoStatus?.status === 'available' && ensoStatus.latestSeason ? (
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-base font-semibold tabular-nums"
                style={{ fontFamily: 'var(--calcite-code-family)' }}
              >
                {ensoStatus.latestSeason.oniAnomalyC >= 0 ? '+' : ''}
                {ensoStatus.latestSeason.oniAnomalyC.toFixed(2)} °C ({ensoStatus.latestSeason.seasonCode}{' '}
                {ensoStatus.latestSeason.year})
              </span>
              <CalciteChip
                scale="s"
                kind="neutral"
                appearance="outline-fill"
                style={{ '--calcite-chip-border-color': ensoColor } as CSSProperties}
              >
                {ensoStatus.latestSeason.phase}
              </CalciteChip>
            </div>
            <div style={{ color: 'var(--calcite-color-text-3)' }}>
              {ensoStatus.tanaSeasonCaveat}
            </div>
            <CalciteBlock collapsible heading="Recent 12-Season ONI Trend" scale="s">
              <CalciteTable caption="NOAA CPC ONI Recent Seasons" scale="s" bordered striped>
                <CalciteTableRow slot="table-header">
                  <CalciteTableHeader heading="Season" />
                  <CalciteTableHeader heading="Anom (°C)" />
                  <CalciteTableHeader heading="Phase" />
                </CalciteTableRow>
                {ensoStatus.recentSeasons.slice(-6).reverse().map((s) => (
                  <CalciteTableRow key={`${s.year}-${s.seasonCode}`}>
                    <CalciteTableCell>{s.seasonCode} {s.year}</CalciteTableCell>
                    <CalciteTableCell>
                      <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                        {s.oniAnomalyC >= 0 ? '+' : ''}{s.oniAnomalyC.toFixed(2)}
                      </span>
                    </CalciteTableCell>
                    <CalciteTableCell>{s.phase}</CalciteTableCell>
                  </CalciteTableRow>
                ))}
              </CalciteTable>
            </CalciteBlock>
          </div>
        ) : (
          <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
            <div slot="message">
              {ensoStatus?.errorMessage || 'NOAA CPC ONI live feed currently unavailable.'}
            </div>
          </CalciteNotice>
        )}

        <CalciteButton
          slot="footer-end"
          scale="s"
          appearance="transparent"
          iconStart="information"
          onClick={() => onOpenIndicatorInfo('ind_enso_oni')}
        >
          Provenance
        </CalciteButton>
      </CalciteCard>

      {/* CARD 2 & 3: CATCHMENT RAINFALL + SOIL WETNESS & PET */}
      <div className="grid grid-cols-1 gap-2.5">
        <CalciteCard scale="s">
          <span slot="heading">2. Catchment Rainfall (CHIRPS Jan–Sep 2026)</span>
          <span slot="description">
            {activeZonal?.name || 'All 5 Upper Tana Sub-Basins'} · Incomplete year (Oct–Dec absent)
          </span>
          {zonalLoading ? (
            <CalciteLoader inline scale="s" label="Computing CHIRPS polygon zonal average" />
          ) : activeZonal ? (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span
                  className="text-base font-semibold tabular-nums"
                  style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-brand)' }}
                >
                  {activeZonal.chirpsYtd2026Mm.mean?.toFixed(0) ?? '—'} mm
                </span>
                <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                  Anom:{' '}
                  {activeZonal.chirpsAnomPct.mean !== null
                    ? `${activeZonal.chirpsAnomPct.mean >= 0 ? '+' : ''}${activeZonal.chirpsAnomPct.mean.toFixed(1)}%`
                    : '—'}{' '}
                  (z = {activeZonal.chirpsAnomZ.mean?.toFixed(2) ?? '—'})
                </span>
              </div>
              <div style={{ color: 'var(--calcite-color-text-3)' }}>
                Matched 2001–2025 Jan–Sep mean: {activeZonal.chirpsYtdBaselineMm.mean?.toFixed(0) ?? '—'} mm
              </div>
            </div>
          ) : null}
          <CalciteButton
            slot="footer-start"
            scale="s"
            appearance="outline"
            onClick={() => onActivateLayer('chirps_anomaly_2026', 2)}
          >
            Map Layer
          </CalciteButton>
          <CalciteButton
            slot="footer-end"
            scale="s"
            kind="brand"
            appearance="outline"
            onClick={() => onNavigateWorkspace('catchment_response')}
          >
            Catchment Lab
          </CalciteButton>
        </CalciteCard>

        <CalciteCard scale="s">
          <span slot="heading">3. Catchment Wetness &amp; Demand (ERA5-Land)</span>
          <span slot="description">0.10° (~11 km) Root-zone soil moisture &amp; PET (demand ≠ actual ET)</span>
          {zonalLoading ? (
            <CalciteLoader inline scale="s" label="Computing ERA5 polygon zonal average" />
          ) : activeZonal ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div style={{ color: 'var(--calcite-color-text-3)' }}>Root-Zone SM (0–100 cm)</div>
                <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                  {activeZonal.era5SmRootZone2026.mean?.toFixed(4) ?? '—'} m³/m³
                </div>
                <div style={{ color: 'var(--calcite-color-text-3)' }}>
                  Anom:{' '}
                  {activeZonal.era5SmRootZoneAnom.mean !== null
                    ? `${activeZonal.era5SmRootZoneAnom.mean >= 0 ? '+' : ''}${activeZonal.era5SmRootZoneAnom.mean.toFixed(4)}`
                    : '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--calcite-color-text-3)' }}>PET (Atmos. Demand)</div>
                <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                  {activeZonal.era5Pet2026MmDay.mean?.toFixed(2) ?? '—'} mm/d
                </div>
                <div style={{ color: 'var(--calcite-color-text-3)' }}>
                  Base: {activeZonal.era5PetBaseMmDay.mean?.toFixed(2) ?? '—'} mm/d
                </div>
              </div>
            </div>
          ) : null}
          <CalciteButton
            slot="footer-start"
            scale="s"
            appearance="outline"
            onClick={() => onActivateLayer('era5_sm_anomaly_2026', 4)}
          >
            Map Soil Anom.
          </CalciteButton>
          <CalciteButton
            slot="footer-end"
            scale="s"
            appearance="transparent"
            onClick={() => onOpenIndicatorInfo('ind_era5_soil_moisture')}
          >
            Caveats
          </CalciteButton>
        </CalciteCard>
      </div>

      {/* CARD 4: RIVER SIGNAL (GEOGLOWS ECMWF) */}
      <CalciteCard scale="s">
        <span slot="heading">4. River Signal (GEOGLOWS ECMWF v2)</span>
        <span slot="description">
          {selectedReach ? 'Selected Upper Tana river reach' : 'Loading verified reach...'}
        </span>
        {streamflowAnalysis ? (
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <CalciteChip scale="s" kind="brand" appearance="outline-fill">
                {streamflowAnalysis.signalClass}
              </CalciteChip>
              <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                Peak {streamflowAnalysis.forecastMetrics.peakMedianM3s?.toFixed(1) ?? '—'} m³/s
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5" style={{ color: 'var(--calcite-color-text-2)' }}>
              <div>
                Hist. Rank: {streamflowAnalysis.forecastMetrics.peakMedianHistoricalPercentile ?? '—'}th %ile
              </div>
              <div>RP: {streamflowAnalysis.exceedance.highestExceededRpByMedian}</div>
              <div>
                10d HRES Peak: {streamflowAnalysis.forecastMetrics.peakHresM3s?.toFixed(1) ?? '—'} m³/s
              </div>
              <div>Uncertainty: {streamflowAnalysis.forecastMetrics.uncertaintyLevel}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
            Open Streamflow Intelligence to inspect forecast ensembles and historical flow context for the selected reach.
          </div>
        )}
        <CalciteButton
          slot="footer-start"
          scale="s"
          appearance="outline"
          onClick={() =>
            onToggleLayer('geoglows_forecast', !Boolean(layersState.geoglows_forecast?.visible))
          }
        >
          {layersState.geoglows_forecast?.visible ? 'MapServer: ON' : 'MapServer: OFF'}
        </CalciteButton>
        <CalciteButton
          slot="footer-end"
          scale="s"
          kind="brand"
          onClick={() => onNavigateWorkspace('streamflow')}
        >
          Streamflow Workspace
        </CalciteButton>
      </CalciteCard>

      {/* CARD 5: MULTI-SIGNAL CONSISTENCY & EXPOSURE SCREENING */}
      <CalciteCard scale="s">
        <span slot="heading">5. Signal Consistency &amp; Corridor Screening</span>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <CalciteChip
              scale="s"
              kind="neutral"
              appearance="outline-fill"
              style={{ '--calcite-chip-border-color': consistencyColor } as CSSProperties}
            >
              {consistency.classification}
            </CalciteChip>
            {exposureScreening && (
              <span className="tabular-nums font-medium" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                {exposureScreening.bufferMeters} m: ~{exposureScreening.population2025.estimatedTotal?.toLocaleString() ?? '—'} ppl
              </span>
            )}
          </div>
          <p className="m-0 leading-relaxed" style={{ color: 'var(--calcite-color-text-2)' }}>
            {consistency.summary}
          </p>
        </div>
        <CalciteButton
          slot="footer-start"
          scale="s"
          appearance="outline"
          onClick={() => onNavigateWorkspace('impact_exposure')}
        >
          Impact &amp; Exposure
        </CalciteButton>
        <CalciteButton
          slot="footer-end"
          scale="s"
          appearance="outline"
          onClick={() => onNavigateWorkspace('water_operations')}
        >
          Water Operations
        </CalciteButton>
      </CalciteCard>

      {/* LINKED 8-STEP ANALYTICAL INVESTIGATION WORKFLOW */}
      <CalciteBlock
        open
        heading="Linked Investigation Flow (8 Steps)"
        description="Step through the hydrological evidence chain across the 5 workspaces"
      >
        <CalciteList selectionMode="none" scale="s">
          {INVESTIGATION_STEPS.map((st) => (
            <CalciteListItem
              key={st.step}
              label={`${st.step} · ${st.title}`}
              description={st.description}
              onCalciteListItemSelect={() => onNavigateWorkspace(st.target)}
            />
          ))}
        </CalciteList>
      </CalciteBlock>

      {/* SITUATION ASSESSMENT REPORT MODAL */}
      <CalciteDialog
        open={reportOpen}
        heading={situationReport.title}
        description={`Generated ${situationReport.generatedAt.slice(0, 16).replace('T', ' ')} UTC`}
        modal
        width="l"
        onCalciteDialogClose={() => setReportOpen(false)}
      >
        <div className="flex flex-col gap-3 text-xs leading-relaxed" style={{ color: 'var(--calcite-color-text-1)' }}>
          <div
            className="p-2.5 rounded grid grid-cols-2 gap-1.5"
            style={{
              backgroundColor: 'var(--calcite-color-foreground-2)',
              border: '1px solid var(--calcite-color-border-3)',
              fontFamily: 'var(--calcite-code-family)',
            }}
          >
            <div>Sub-Basin: {situationReport.selectedSubBasinName}</div>
            <div>Reach: {situationReport.selectedReachName} ({situationReport.selectedLinkno ?? '—'})</div>
            <div>Window: {situationReport.analysisWindow}</div>
          </div>

          {[
            ['1. ENSO Context', situationReport.ensoContext],
            ['2. Rainfall Conditions (CHIRPS)', situationReport.rainfallConditions],
            ['3. Catchment Wetness & PET (ERA5-Land)', situationReport.catchmentWetnessAndPet],
            ['4. Streamflow Conditions (GEOGLOWS)', situationReport.streamflowConditions],
            ['5. Forecast vs. 1940–Present History', situationReport.forecastVsHistorical],
            ['6. Return-Period Reference', situationReport.returnPeriodInterpretation],
            ['7. Multi-Signal Consistency', situationReport.signalConsistency],
            ['8. Potentially Exposed Areas (Estimated)', situationReport.potentiallyExposedAreas],
            ['9. Hypothetical Water Operations', situationReport.waterManagementConsiderations],
          ].map(([heading, body]) => (
            <CalciteCard key={heading} scale="s">
              <span slot="heading">{heading}</span>
              <p className="m-0" style={{ color: 'var(--calcite-color-text-2)' }}>
                {body}
              </p>
            </CalciteCard>
          ))}

          <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
            <div slot="title">Key Scientific Limitations</div>
            <div slot="message">
              <ul className="m-0 pl-4 flex flex-col gap-1">
                {situationReport.uncertaintyAndLimitations.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          </CalciteNotice>
        </div>

        <CalciteButton slot="footer-start" appearance="outline" onClick={() => setReportOpen(false)}>
          Close
        </CalciteButton>
        <CalciteButton slot="footer-end" appearance="outline" iconStart="download" onClick={handleExportJson}>
          Export JSON
        </CalciteButton>
        <CalciteButton slot="footer-end" kind="brand" iconStart="download" onClick={handleExportMd}>
          Download Markdown (.md)
        </CalciteButton>
      </CalciteDialog>
    </div>
  );
}
