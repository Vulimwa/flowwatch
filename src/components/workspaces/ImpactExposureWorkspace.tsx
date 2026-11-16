import type { CSSProperties } from 'react';
import {
  CalciteAction,
  CalciteBlock,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteLoader,
  CalciteMeter,
  CalciteNotice,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
  CalciteTable,
  CalciteTableCell,
  CalciteTableHeader,
  CalciteTableRow,
} from '@esri/calcite-components-react';

import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import type {
  AppModuleId,
  ExposureScreeningResult,
  GeoglowsReachRecord,
  StreamflowAnalysisResult,
  SubBasinZonalStats,
} from '../../types/geospatial';

interface ImpactExposureWorkspaceProps {
  selectedLinkno: number | null;
  selectedReach: GeoglowsReachRecord | null;
  bufferMeters: 500 | 1000 | 2000 | 5000;
  onChangeBufferMeters: (meters: 500 | 1000 | 2000 | 5000) => void;
  screening: ExposureScreeningResult | null;
  screeningLoading: boolean;
  screeningError: string | null;
  onRunScreening: () => void;
  onZoomToReach: (linkno: number) => void;
  onZoomToCoord: (lon: number, lat: number) => void;
  layersState: Record<string, LayerRuntimeState>;
  onActivateLayer: (datasetId: string, band?: number) => void;
  onToggleLayer: (datasetId: string, visible: boolean) => void;
  onOpenIndicatorInfo: (indicatorId: string) => void;
  onNavigateWorkspace: (id: AppModuleId) => void;
  streamflowAnalysis: StreamflowAnalysisResult | null;
  activeZonal: SubBasinZonalStats | null;
}

const BUFFER_OPTIONS: Array<500 | 1000 | 2000 | 5000> = [500, 1000, 2000, 5000];

export function ImpactExposureWorkspace({
  selectedLinkno,
  selectedReach,
  bufferMeters,
  onChangeBufferMeters,
  screening,
  screeningLoading,
  screeningError,
  onRunScreening,
  onZoomToReach,
  onZoomToCoord,
  layersState,
  onActivateLayer,
  onToggleLayer,
  onOpenIndicatorInfo,
  onNavigateWorkspace,
  streamflowAnalysis,
  activeZonal,
}: ImpactExposureWorkspaceProps) {
  const townsVisible = Boolean(layersState.kenya_towns?.visible);
  const healthVisible = Boolean(layersState.kenya_health_facilities?.visible);
  const schoolsVisible = Boolean(layersState.kenya_primary_schools?.visible);

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Critical Non-Inundation Screening Notice */}
      <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
        <div slot="title">Proximity Corridor Screening — Not a Hydraulic Flood Map</div>
        <div slot="message">
          Distance buffers (500 m to 5 km) and HAND terrain height screen potentially exposed people, built-up surfaces, and infrastructure near a selected river reach. They do NOT represent calibrated flood inundation depth or extents.
        </div>
      </CalciteNotice>

      {/* Active Reach & Corridor Buffer Configuration */}
      <CalciteBlock
        open
        heading="Corridor Buffer & Active Reach"
        description={
          selectedReach
            ? `${selectedReach.displayName} (LINKNO ${selectedReach.linkno})`
            : 'Select a verified GEOGLOWS reach to screen corridor exposure'
        }
      >
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--calcite-color-text-2)' }}>
              Corridor Screening Radius (Distance from Reach Polyline)
            </div>
            <CalciteSegmentedControl
              scale="s"
              width="full"
              onCalciteSegmentedControlChange={(e) => {
                const v = Number((e.target as HTMLCalciteSegmentedControlElement).value);
                if (v === 500 || v === 1000 || v === 2000 || v === 5000) {
                  onChangeBufferMeters(v);
                }
              }}
            >
              {BUFFER_OPTIONS.map((m) => (
                <CalciteSegmentedControlItem
                  key={m}
                  value={String(m)}
                  checked={bufferMeters === m}
                >
                  {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                </CalciteSegmentedControlItem>
              ))}
            </CalciteSegmentedControl>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <CalciteButton
              scale="s"
              kind="brand"
              iconStart="refresh"
              disabled={selectedLinkno === null || screeningLoading}
              onClick={onRunScreening}
            >
              {screeningLoading ? 'Screening Corridor...' : 'Run Corridor Screening'}
            </CalciteButton>
            {selectedLinkno !== null && (
              <CalciteButton
                scale="s"
                appearance="outline"
                iconStart="zoom-to-object"
                onClick={() => onZoomToReach(selectedLinkno)}
              >
                Zoom Reach
              </CalciteButton>
            )}
            <CalciteButton
              scale="s"
              appearance="transparent"
              iconStart="information"
              onClick={() => onOpenIndicatorInfo('ind_corridor_exposure')}
            >
              Method &amp; Caveats
            </CalciteButton>
          </div>

          {/* Exposure Overlay Toggles */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <CalciteButton
              scale="s"
              kind={townsVisible ? 'brand' : 'neutral'}
              appearance={townsVisible ? 'solid' : 'outline'}
              onClick={() => onToggleLayer('kenya_towns', !townsVisible)}
            >
              Towns: {townsVisible ? 'ON' : 'OFF'}
            </CalciteButton>
            <CalciteButton
              scale="s"
              kind={healthVisible ? 'brand' : 'neutral'}
              appearance={healthVisible ? 'solid' : 'outline'}
              onClick={() => onToggleLayer('kenya_health_facilities', !healthVisible)}
            >
              Health Facilities: {healthVisible ? 'ON' : 'OFF'}
            </CalciteButton>
            <CalciteButton
              scale="s"
              kind={schoolsVisible ? 'brand' : 'neutral'}
              appearance={schoolsVisible ? 'solid' : 'outline'}
              onClick={() => onToggleLayer('kenya_primary_schools', !schoolsVisible)}
            >
              Schools: {schoolsVisible ? 'ON' : 'OFF'}
            </CalciteButton>
          </div>
        </div>
      </CalciteBlock>

      {selectedLinkno === null ? (
        <CalciteNotice open kind="info" scale="s" icon="layer-stream">
          <div slot="title">No Verified Reach Selected</div>
          <div slot="message">
            Choose a verified GEOGLOWS reach in Streamflow Intelligence or click a verified river segment on the map before running corridor exposure screening.
          </div>
          <CalciteButton
            slot="actions-end"
            scale="s"
            kind="brand"
            onClick={() => onNavigateWorkspace('streamflow')}
          >
            Select Reach
          </CalciteButton>
        </CalciteNotice>
      ) : screeningLoading ? (
        <div className="py-6 flex justify-center">
          <CalciteLoader
            scale="m"
            label="Screening corridor population, HAND, land cover, and infrastructure"
            text={`Extracting ${bufferMeters >= 1000 ? `${bufferMeters / 1000} km` : `${bufferMeters} m`} corridor metrics for LINKNO ${selectedLinkno}...`}
          />
        </div>
      ) : screeningError ? (
        <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
          <div slot="title">Corridor Screening Error</div>
          <div slot="message">{screeningError}</div>
          <CalciteButton
            slot="actions-end"
            scale="s"
            appearance="outline"
            onClick={onRunScreening}
          >
            Retry
          </CalciteButton>
        </CalciteNotice>
      ) : screening ? (
        <div className="flex flex-col gap-3">
          {/* 1. Population 2025 & Built-Up 2020 */}
          <CalciteBlock
            open
            heading="Population (2025) & Built-Up Settlement Screening"
            description={`Approx. ${screening.corridorAreaKm2Approx.toFixed(1)} km² corridor (${screening.bufferMeters.toLocaleString()} m buffer)`}
            data-demo-target="exposure-layers"
            data-voice-hint="Population and built-up layers add exposure context to the selected river corridor. This is a screening result, not a validated flood-inundation boundary or damage estimate."
          >
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <CalciteCard scale="s">
                  <span slot="heading">Estimated Population (2025)</span>
                  <div
                    className="text-base font-semibold tabular-nums"
                    style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-brand)' }}
                  >
                    {screening.population2025.estimatedTotal !== null
                      ? `~${screening.population2025.estimatedTotal.toLocaleString()}`
                      : 'Unavailable'}
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>
                    {screening.population2025.validCells.toLocaleString()} unique ~100 m cells
                  </div>
                  <CalciteButton
                    slot="footer-end"
                    scale="s"
                    appearance="outline"
                    onClick={() => onActivateLayer('population_2025')}
                  >
                    Map Layer
                  </CalciteButton>
                </CalciteCard>

                <CalciteCard scale="s">
                  <span slot="heading">Built-Up Fraction (2020)</span>
                  <div
                    className="text-base font-semibold tabular-nums"
                    style={{ fontFamily: 'var(--calcite-code-family)' }}
                  >
                    {screening.builtUp2020.meanBuiltUpPct !== null
                      ? `${screening.builtUp2020.meanBuiltUpPct.toFixed(2)}%`
                      : 'Unavailable'}
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>
                    {screening.builtUp2020.cellsWithBuiltUp.toLocaleString()} built-up cells
                  </div>
                  <CalciteButton
                    slot="footer-end"
                    scale="s"
                    appearance="outline"
                    onClick={() => onActivateLayer('builtup_2020')}
                  >
                    Map Layer
                  </CalciteButton>
                </CalciteCard>
              </div>

              <div
                className="p-2 rounded text-xs leading-relaxed"
                style={{
                  backgroundColor: 'var(--calcite-color-foreground-2)',
                  border: '1px solid var(--calcite-color-border-3)',
                  color: 'var(--calcite-color-text-2)',
                }}
              >
                <strong>Screening Estimate Methodology:</strong>{' '}
                {screening.population2025.resolutionNote} ({screening.population2025.year}).{' '}
                {screening.population2025.aggregationMethod}. {screening.population2025.nodataTreatment}.
              </div>
            </div>
          </CalciteBlock>

          {/* 2. HAND & Terrain Context */}
          <CalciteBlock
            open
            heading="HAND & Corridor Terrain Profile"
            description="Relative height above nearest drainage (~90 m) — NOT flood water depth"
          >
            <div className="flex flex-col gap-2.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <CalciteCard scale="s">
                  <span slot="heading">Median HAND</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {screening.handTerrain.medianHandM?.toFixed(1) ?? '—'} m
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">Mean Elev.</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {screening.handTerrain.meanElevationM?.toFixed(0) ?? '—'} m
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">Mean Slope</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {screening.handTerrain.meanSlopeDeg?.toFixed(1) ?? '—'}°
                  </div>
                </CalciteCard>
              </div>

              <CalciteCard scale="s">
                <span slot="heading">Corridor Terrain Elevation Above Channel (HAND Classes)</span>
                <div className="flex flex-col gap-2 pt-1">
                  {[
                    {
                      label: 'Low-lying (<5 m HAND)',
                      pct: screening.handTerrain.pctUnder5m,
                      color: 'var(--calcite-color-status-danger)',
                    },
                    {
                      label: 'Moderate Terrace (5–15 m HAND)',
                      pct: screening.handTerrain.pct5to15m,
                      color: 'var(--calcite-color-status-warning)',
                    },
                    {
                      label: 'Elevated Ground (>15 m HAND)',
                      pct: screening.handTerrain.pctOver15m,
                      color: 'var(--calcite-color-brand)',
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col gap-0.5">
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--calcite-color-text-2)' }}>{item.label}</span>
                        <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {item.pct !== null ? `${item.pct.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                      <CalciteMeter
                        scale="s"
                        label={item.label}
                        min={0}
                        max={100}
                        value={item.pct ?? 0}
                        fillType="single"
                        style={{ '--calcite-meter-fill-color': item.color } as CSSProperties}
                      />
                    </div>
                  ))}
                </div>
                <div slot="footer-start" className="text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
                  {screening.handTerrain.caveat}
                </div>
                <CalciteButton
                  slot="footer-end"
                  scale="s"
                  appearance="outline"
                  onClick={() => onActivateLayer('hand')}
                >
                  Map HAND
                </CalciteButton>
              </CalciteCard>
            </div>
          </CalciteBlock>

          {/* 3. ESA WorldCover 10 m & EC JRC Surface Water */}
          <CalciteBlock
            collapsible
            open
            heading="Land Cover (10 m) & JRC Surface Water (1984–2021)"
          >
            <div className="flex flex-col gap-2.5 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  onClick={() => onActivateLayer('land_cover')}
                >
                  Map ESA WorldCover
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  onClick={() => onActivateLayer('surface_water_occurrence')}
                >
                  JRC Occurrence
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  onClick={() => onActivateLayer('surface_water_seasonality')}
                >
                  JRC Seasonality
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  onClick={() => onActivateLayer('surface_water_transition')}
                >
                  JRC Transition
                </CalciteButton>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <CalciteCard scale="s">
                  <span slot="heading">JRC Mean Occurrence</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {screening.surfaceWater.meanOccurrencePct !== null
                      ? `${screening.surfaceWater.meanOccurrencePct.toFixed(1)}%`
                      : '—'}
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>
                    Max: {screening.surfaceWater.maxOccurrencePct !== null
                      ? `${screening.surfaceWater.maxOccurrencePct.toFixed(0)}%`
                      : '—'}
                  </div>
                </CalciteCard>
                <CalciteCard scale="s">
                  <span slot="heading">JRC Seasonality</span>
                  <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                    {screening.surfaceWater.meanSeasonalityMonths !== null
                      ? `${screening.surfaceWater.meanSeasonalityMonths.toFixed(1)} mo/yr`
                      : '—'}
                  </div>
                  <div style={{ color: 'var(--calcite-color-text-3)' }}>1984–2021 Landsat water</div>
                </CalciteCard>
              </div>

              {screening.landCover.classes.length > 0 && (
                <CalciteCard scale="s">
                  <span slot="heading">Corridor ESA WorldCover Breakdown</span>
                  <div className="flex flex-col gap-1.5 pt-1">
                    {screening.landCover.classes.slice(0, 6).map((lc) => (
                      <div key={lc.code} className="flex items-center justify-between">
                        <span>{lc.label}</span>
                        <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {lc.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CalciteCard>
              )}
            </div>
          </CalciteBlock>

          {/* 4. Verified Settlements & Critical Infrastructure Inside Corridor */}
          <CalciteBlock
            open
            heading="Verified Infrastructure & Settlements Inside Buffer"
            description="Africa GeoPortal FeatureServer point queries (UTM 37S distance to reach)"
          >
            <div className="flex flex-col gap-2.5 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <CalciteChip scale="s" kind="brand" appearance="outline-fill">
                  Towns: {screening.nearbySettlements.length}
                </CalciteChip>
                <CalciteChip scale="s" kind="brand" appearance="outline-fill">
                  Health Facilities: {screening.nearbyHealthFacilities.length}
                </CalciteChip>
                <CalciteChip scale="s" kind="neutral" appearance="outline-fill">
                  Primary Schools: {screening.nearbySchoolsCount}
                </CalciteChip>
              </div>

              {screening.nearbySettlements.length > 0 ? (
                <div className="overflow-x-auto max-h-44 overflow-y-auto">
                  <CalciteTable caption="Kenya Towns Inside Corridor Buffer" scale="s" bordered striped>
                    <CalciteTableRow slot="table-header">
                      <CalciteTableHeader heading="Settlement" />
                      <CalciteTableHeader heading="Type" />
                      <CalciteTableHeader heading="Dist. to Reach" />
                      <CalciteTableHeader heading="Map" />
                    </CalciteTableRow>
                    {screening.nearbySettlements.slice(0, 20).map((st) => (
                      <CalciteTableRow key={`town-${st.id}`}>
                        <CalciteTableCell>{st.name}</CalciteTableCell>
                        <CalciteTableCell>{st.category}</CalciteTableCell>
                        <CalciteTableCell>
                          <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                            {st.distanceMeters.toLocaleString()} m
                          </span>
                        </CalciteTableCell>
                        <CalciteTableCell>
                          <CalciteAction
                            scale="s"
                            icon="pin"
                            text={`Zoom to ${st.name}`}
                            onClick={() => onZoomToCoord(st.lon, st.lat)}
                          />
                        </CalciteTableCell>
                      </CalciteTableRow>
                    ))}
                  </CalciteTable>
                </div>
              ) : (
                <CalciteNotice open kind="info" scale="s" icon="pin">
                  <div slot="message">
                    No named Kenya_Towns points fell within {screening.bufferMeters.toLocaleString()} m of LINKNO {screening.linkno}. Try 2 km or 5 km radius.
                  </div>
                </CalciteNotice>
              )}

              {screening.nearbyHealthFacilities.length > 0 ? (
                <div className="overflow-x-auto max-h-44 overflow-y-auto">
                  <CalciteTable caption="Kenya Health Facilities (2026) Inside Corridor Buffer" scale="s" bordered striped>
                    <CalciteTableRow slot="table-header">
                      <CalciteTableHeader heading="Health Facility" />
                      <CalciteTableHeader heading="Category" />
                      <CalciteTableHeader heading="Dist." />
                      <CalciteTableHeader heading="Map" />
                    </CalciteTableRow>
                    {screening.nearbyHealthFacilities.slice(0, 25).map((hf) => (
                      <CalciteTableRow key={`hf-${hf.id}`}>
                        <CalciteTableCell>{hf.name}</CalciteTableCell>
                        <CalciteTableCell>{hf.category}</CalciteTableCell>
                        <CalciteTableCell>
                          <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                            {hf.distanceMeters.toLocaleString()} m
                          </span>
                        </CalciteTableCell>
                        <CalciteTableCell>
                          <CalciteAction
                            scale="s"
                            icon="pin"
                            text={`Zoom to ${hf.name}`}
                            onClick={() => onZoomToCoord(hf.lon, hf.lat)}
                          />
                        </CalciteTableCell>
                      </CalciteTableRow>
                    ))}
                  </CalciteTable>
                </div>
              ) : (
                <CalciteNotice open kind="info" scale="s" icon="information">
                  <div slot="message">
                    No MOH health facilities fell within {screening.bufferMeters.toLocaleString()} m of this reach.
                  </div>
                </CalciteNotice>
              )}
            </div>
          </CalciteBlock>

          {/* 5. Structured Epistemic Impact Assessment Card */}
          <CalciteBlock
            open
            heading="Structured Corridor Impact Assessment"
            description="Strict separation of Observed, Modelled, Derived, and Estimated evidence"
          >
            <CalciteCard scale="s">
              <div className="flex flex-col gap-2 text-xs leading-relaxed">
                <div>
                  <CalciteChip scale="s" kind="brand" appearance="outline-fill">Observed</CalciteChip>{' '}
                  <span>
                    {screening.nearbySettlements.length} mapped town point(s),{' '}
                    {screening.nearbyHealthFacilities.length} health facility point(s), and{' '}
                    {screening.nearbySchoolsCount} primary school(s) sit within {screening.bufferMeters.toLocaleString()} m of {screening.reachName}
                    {activeZonal?.chirpsAnomPct.mean !== null && activeZonal?.chirpsAnomPct.mean !== undefined
                      ? `; YTD Jan–Sep 2026 CHIRPS sub-basin anomaly is ${activeZonal.chirpsAnomPct.mean >= 0 ? '+' : ''}${activeZonal.chirpsAnomPct.mean.toFixed(1)}%.`
                      : '.'}
                  </span>
                </div>

                <div>
                  <CalciteChip scale="s" kind="neutral" appearance="outline-fill">Modelled</CalciteChip>{' '}
                  <span>
                    {streamflowAnalysis
                      ? `GEOGLOWS v2 signal is "${streamflowAnalysis.signalClass}" (peak median ${
                          streamflowAnalysis.forecastMetrics.peakMedianM3s?.toFixed(1) ?? '—'
                        } m³/s, ${streamflowAnalysis.forecastMetrics.peakMedianHistoricalPercentile ?? '—'}th historical percentile).`
                      : 'Open Streamflow Intelligence to link GEOGLOWS flow signal.'}{' '}
                    HAND indicates {screening.handTerrain.pctUnder5m?.toFixed(1) ?? '—'}% of corridor cells lie &lt;5 m above nearest drainage.
                  </span>
                </div>

                <div>
                  <CalciteChip scale="s" kind="neutral" appearance="outline-fill">Derived</CalciteChip>{' '}
                  <span>
                    {screening.handTerrain.medianHandM !== null
                      ? `Median terrain HAND = ${screening.handTerrain.medianHandM.toFixed(1)} m; `
                      : ''}
                    ESA WorldCover &amp; JRC 1984–2021 occurrence ({screening.surfaceWater.meanOccurrencePct?.toFixed(1) ?? '—'}% mean) characterize persistent channel/floodplain corridors.
                  </span>
                </div>

                <div>
                  <CalciteChip scale="s" kind="neutral" appearance="outline">Estimated</CalciteChip>{' '}
                  <span>
                    Gridded 2025 population inside the {screening.bufferMeters.toLocaleString()} m screening corridor is ~
                    {screening.population2025.estimatedTotal?.toLocaleString() ?? '—'} people (~100 m cell-center sum). Treat as priority reconnaissance headcount, NOT confirmed flood impact.
                  </span>
                </div>

                {screening.priorityInvestigationNotes.length > 0 && (
                  <div className="pt-1 border-t" style={{ borderColor: 'var(--calcite-color-border-3)' }}>
                    <strong>Investigation Priorities:</strong>
                    <ul className="m-0 pl-4 mt-1 flex flex-col gap-1" style={{ color: 'var(--calcite-color-text-2)' }}>
                      {screening.priorityInvestigationNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CalciteCard>
          </CalciteBlock>
        </div>
      ) : null}
    </div>
  );
}
