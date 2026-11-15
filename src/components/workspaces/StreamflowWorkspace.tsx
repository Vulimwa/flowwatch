import { useEffect, useMemo, useState } from 'react';
import {
  CalciteAction,
  CalciteBlock,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteInput,
  CalciteLabel,
  CalciteList,
  CalciteListItem,
  CalciteLoader,
  CalciteNotice,
  CalciteOption,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
  CalciteSelect,
  CalciteSlider,
  CalciteSwitch,
  CalciteTab,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTable,
  CalciteTableCell,
  CalciteTableHeader,
  CalciteTableRow,
  CalciteTabs,
} from '@esri/calcite-components-react';

import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import { fetchGeoglowsReachAnalysis } from '../../services/analytics/analyticsClient';
import {
  fetchGeoglowsEnsembles,
  fetchGeoglowsForecast,
  fetchGeoglowsHistorical,
  fetchGeoglowsReachContext,
  fetchGeoglowsReturnPeriods,
} from '../../services/geoglows/geoglowsService';
import type {
  AppModuleId,
  DiscoveredServiceMetadata,
  GeoglowsEnsembleBundle,
  GeoglowsForecastBundle,
  GeoglowsHistoricalResponse,
  GeoglowsMapServerMeta,
  GeoglowsReachContextResponse,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
  GeoglowsReturnPeriodsResponse,
  StreamflowAnalysisResult,
  TanaReachMatch,
} from '../../types/geospatial';
import {
  ForecastHydrographChart,
  HistoricalStreamflowChart,
} from '../rivers/GeoglowsHydrograph';

interface StreamflowWorkspaceProps {
  layersState: Record<string, LayerRuntimeState>;
  streamsMeta?: DiscoveredServiceMetadata;
  geoglowsMapMeta: GeoglowsMapServerMeta | null;
  geoglowsForecastTimeMs: number | null;
  onChangeGeoglowsTimeMs: (ms: number | null) => void;
  geoglowsIndex: GeoglowsReachIndexResponse | null;
  geoglowsIndexLoading: boolean;
  geoglowsIndexError: string | null;
  onReloadGeoglowsIndex: () => void;
  selectedStreamFid: number | null;
  selectedLinkno: number | null;
  selectedTanaMatch: TanaReachMatch | null;
  geoglowsUnverifiedMsg: string | null;
  onSelectGeoglowsReach: (linkno: number, zoom?: boolean) => void;
  onSelectLocalStream: (fid: number, zoom?: boolean) => void;
  onZoomToGeoglowsReach: (linkno: number) => void;
  onToggleLayer: (datasetId: string, visible: boolean) => void;
  onActivateRaster: (datasetId: string) => void;
  onNavigateWorkspace: (id: AppModuleId) => void;
  onOpenIndicatorInfo: (indicatorId: string) => void;
  onAnalysisLoaded?: (analysis: StreamflowAnalysisResult | null) => void;
}

type ReachListMode = 'matched' | 'all_geoglows' | 'unverified_local';
type HistoricalMode = 'daily' | 'monthly' | 'annual' | 'monthly_climatology' | 'daily_climatology';

function formatIssueDateLabel(code: string): string {
  if (!/^\d{10}$/.test(code)) return code;
  return `${code.slice(0, 4)}-${code.slice(4, 6)}-${code.slice(6, 8)} ${code.slice(8, 10)}:00 UTC`;
}

function damPosLabel(pos: GeoglowsReachRecord['damPosition']): string {
  switch (pos) {
    case 'upstream_masinga':
      return 'Upstream of Masinga Dam';
    case 'seven_forks_cascade':
      return 'Seven Forks Cascade';
    case 'downstream_cascade':
      return 'Downstream of Cascade';
    default:
      return 'Tributary / Basin Reach';
  }
}

function signalToneToken(signalClass: StreamflowAnalysisResult['signalClass']): string {
  if (signalClass === 'Potential high-flow concern') return 'var(--calcite-color-status-danger)';
  if (signalClass === 'Elevated forecast flow' || signalClass === 'Potential low-flow concern') {
    return 'var(--calcite-color-status-warning)';
  }
  if (signalClass === 'Below-normal modelled flow') return 'var(--calcite-color-status-info)';
  return 'var(--calcite-color-status-success)';
}

export function StreamflowWorkspace({
  layersState,
  streamsMeta,
  geoglowsMapMeta,
  geoglowsForecastTimeMs,
  onChangeGeoglowsTimeMs,
  geoglowsIndex,
  geoglowsIndexLoading,
  geoglowsIndexError,
  onReloadGeoglowsIndex,
  selectedStreamFid,
  selectedLinkno,
  selectedTanaMatch,
  geoglowsUnverifiedMsg,
  onSelectGeoglowsReach,
  onSelectLocalStream,
  onZoomToGeoglowsReach,
  onToggleLayer,
  onActivateRaster,
  onNavigateWorkspace,
  onOpenIndicatorInfo,
  onAnalysisLoaded,
}: StreamflowWorkspaceProps) {
  const [searchText, setSearchText] = useState('');
  const [listMode, setListMode] = useState<ReachListMode>('matched');

  const [issueDate, setIssueDate] = useState<string>('');
  const [forecast, setForecast] = useState<GeoglowsForecastBundle | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<StreamflowAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [showEnsembles, setShowEnsembles] = useState(false);
  const [showHighRes, setShowHighRes] = useState(true);
  const [showReturnOverlay, setShowReturnOverlay] = useState(true);
  const [ensembles, setEnsembles] = useState<GeoglowsEnsembleBundle | null>(null);
  const [ensemblesLoading, setEnsemblesLoading] = useState(false);
  const [ensemblesError, setEnsemblesError] = useState<string | null>(null);

  const [histMode, setHistMode] = useState<HistoricalMode>('monthly');
  const [histStart, setHistStart] = useState<string>('20180101');
  const [histEnd, setHistEnd] = useState<string>('20251231');
  const [historical, setHistorical] = useState<GeoglowsHistoricalResponse | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  const [returnPeriods, setReturnPeriods] = useState<GeoglowsReturnPeriodsResponse | null>(null);
  const [rpLoading, setRpLoading] = useState(false);
  const [rpError, setRpError] = useState<string | null>(null);

  const [reachContext, setReachContext] = useState<GeoglowsReachContextResponse | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState<string | null>(null);

  const selectedReach = useMemo(() => {
    if (!geoglowsIndex || selectedLinkno === null) return null;
    return geoglowsIndex.reaches.find((r) => r.linkno === selectedLinkno) || null;
  }, [geoglowsIndex, selectedLinkno]);

  useEffect(() => {
    setIssueDate('');
    setEnsembles(null);
    setEnsemblesError(null);
  }, [selectedLinkno]);

  // Fetch GEOGLOWS forecast + statistical percentile/duration analysis
  useEffect(() => {
    if (selectedLinkno === null || geoglowsUnverifiedMsg) {
      setForecast(null);
      setAnalysis(null);
      onAnalysisLoaded?.(null);
      setReturnPeriods(null);
      setReachContext(null);
      return;
    }

    const controller = new AbortController();
    setForecastLoading(true);
    setForecastError(null);
    fetchGeoglowsForecast(selectedLinkno, issueDate || null, controller.signal)
      .then((res) => {
        setForecast(res);
        setForecastLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setForecastError(err instanceof Error ? err.message : 'Forecast request failed');
        setForecastLoading(false);
      });

    setAnalysisLoading(true);
    fetchGeoglowsReachAnalysis(selectedLinkno, issueDate || null, controller.signal)
      .then((res) => {
        setAnalysis(res);
        onAnalysisLoaded?.(res);
        setAnalysisLoading(false);
      })
      .catch(() => {
        setAnalysisLoading(false);
      });

    return () => controller.abort();
  }, [selectedLinkno, issueDate, geoglowsUnverifiedMsg, onAnalysisLoaded]);

  useEffect(() => {
    if (!showEnsembles || selectedLinkno === null || geoglowsUnverifiedMsg) return;
    const controller = new AbortController();
    setEnsemblesLoading(true);
    setEnsemblesError(null);
    fetchGeoglowsEnsembles(selectedLinkno, issueDate || null, controller.signal)
      .then((res) => {
        setEnsembles(res);
        setEnsemblesLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setEnsemblesError(err instanceof Error ? err.message : 'Ensemble request failed');
        setEnsemblesLoading(false);
      });
    return () => controller.abort();
  }, [showEnsembles, selectedLinkno, issueDate, geoglowsUnverifiedMsg]);

  useEffect(() => {
    if (selectedLinkno === null || geoglowsUnverifiedMsg) return;
    const controller = new AbortController();
    setRpLoading(true);
    setRpError(null);
    fetchGeoglowsReturnPeriods(selectedLinkno, controller.signal)
      .then((res) => {
        setReturnPeriods(res);
        setRpLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setRpError(err instanceof Error ? err.message : 'Return periods request failed');
        setRpLoading(false);
      });
    return () => controller.abort();
  }, [selectedLinkno, geoglowsUnverifiedMsg]);

  useEffect(() => {
    if (selectedLinkno === null || geoglowsUnverifiedMsg) return;
    const controller = new AbortController();
    setHistLoading(true);
    setHistError(null);
    const useRange = histMode === 'daily' || histMode === 'monthly';
    fetchGeoglowsHistorical(
      selectedLinkno,
      histMode,
      useRange ? histStart : undefined,
      useRange ? histEnd : undefined,
      controller.signal
    )
      .then((res) => {
        setHistorical(res);
        setHistLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setHistError(err instanceof Error ? err.message : 'Historical request failed');
        setHistLoading(false);
      });
    return () => controller.abort();
  }, [selectedLinkno, histMode, histStart, histEnd, geoglowsUnverifiedMsg]);

  useEffect(() => {
    if (selectedLinkno === null || !selectedReach || geoglowsUnverifiedMsg) return;
    const controller = new AbortController();
    setCtxLoading(true);
    setCtxError(null);
    fetchGeoglowsReachContext(
      selectedLinkno,
      selectedReach.centroid[0],
      selectedReach.centroid[1],
      controller.signal
    )
      .then((res) => {
        setReachContext(res);
        setCtxLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setCtxError(err instanceof Error ? err.message : 'Basin context probe failed');
        setCtxLoading(false);
      });
    return () => controller.abort();
  }, [selectedLinkno, selectedReach, geoglowsUnverifiedMsg]);

  const filteredReaches = useMemo(() => {
    if (!geoglowsIndex) return [];
    const q = searchText.trim().toLowerCase();
    return geoglowsIndex.reaches
      .filter((r) => {
        if (listMode === 'matched' && r.matchedFids.length === 0) return false;
        if (!q) return true;
        return (
          String(r.linkno).includes(q) ||
          r.displayName.toLowerCase().includes(q) ||
          r.matchedLocalNames.some((n) => n.toLowerCase().includes(q))
        );
      })
      .slice(0, 120);
  }, [geoglowsIndex, listMode, searchText]);

  const filteredUnverified = useMemo(() => {
    if (!geoglowsIndex) return [];
    const q = searchText.trim().toLowerCase();
    return geoglowsIndex.tanaMatches
      .filter((m) => {
        if (m.verification_status !== 'unverified') return false;
        if (!q) return true;
        return (
          String(m.tana_feature_id).includes(q) ||
          (m.tana_name || '').toLowerCase().includes(q) ||
          m.reason.toLowerCase().includes(q)
        );
      })
      .slice(0, 100);
  }, [geoglowsIndex, searchText]);

  const geoglowsLayerVisible = Boolean(layersState.geoglows_forecast?.visible);
  const streamsVisible = Boolean(layersState.tana_river_streams?.visible);
  const stepMs = (geoglowsMapMeta?.timeIntervalHours || 3) * 3600 * 1000;

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Spatial Layers & MapServer Time Control */}
      <CalciteBlock
        collapsible
        heading="GEOGLOWS MapServer & Drainage Layers"
        description="Living Atlas MapServer + Local Tana Vector + Terrain Drainage"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            <CalciteButton
              scale="s"
              kind={geoglowsLayerVisible ? 'brand' : 'neutral'}
              appearance={geoglowsLayerVisible ? 'solid' : 'outline'}
              onClick={() => onToggleLayer('geoglows_forecast', !geoglowsLayerVisible)}
            >
              {geoglowsLayerVisible ? 'GEOGLOWS MapServer: ON' : 'GEOGLOWS MapServer: OFF'}
            </CalciteButton>
            <CalciteButton
              scale="s"
              kind={streamsVisible ? 'brand' : 'neutral'}
              appearance={streamsVisible ? 'solid' : 'outline'}
              onClick={() => onToggleLayer('tana_river_streams', !streamsVisible)}
            >
              {streamsVisible ? 'Local Tana Vector: ON' : 'Local Tana Vector: OFF'}
            </CalciteButton>
            <CalciteButton
              scale="s"
              appearance="outline"
              onClick={() => onActivateRaster('flow_accumulation')}
            >
              UPA (km²)
            </CalciteButton>
            <CalciteButton
              scale="s"
              appearance="outline"
              onClick={() => onActivateRaster('stream_network_upa100')}
            >
              UPA ≥ 100 km²
            </CalciteButton>
          </div>

          {geoglowsLayerVisible && geoglowsMapMeta?.timeExtent && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--calcite-color-text-2)' }}>
                  Living Atlas MapServer Time (UTC)
                </span>
                <span
                  className="tabular-nums font-medium"
                  style={{ fontFamily: 'var(--calcite-code-family)' }}
                >
                  {geoglowsForecastTimeMs
                    ? new Date(geoglowsForecastTimeMs).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
                    : 'Default'}
                </span>
              </div>
              <CalciteSlider
                min={geoglowsMapMeta.timeExtent[0]}
                max={geoglowsMapMeta.timeExtent[1]}
                step={stepMs}
                value={geoglowsForecastTimeMs ?? geoglowsMapMeta.timeExtent[0]}
                labelHandles={false}
                label="GEOGLOWS MapServer UTC time slider"
                onCalciteSliderInput={(e) => {
                  onChangeGeoglowsTimeMs(Number((e.target as HTMLCalciteSliderElement).value));
                }}
              />
            </div>
          )}

          {geoglowsIndex && (
            <div className="flex flex-wrap gap-1">
              <CalciteChip scale="s" kind="brand" appearance="outline-fill">
                {geoglowsIndex.stats.geoglowsReachCount.toLocaleString()} GEOGLOWS reaches
              </CalciteChip>
              <CalciteChip scale="s" kind="neutral" appearance="outline-fill">
                {geoglowsIndex.stats.verifiedHighCount} high / {geoglowsIndex.stats.verifiedMediumCount} med verified
              </CalciteChip>
              <CalciteChip scale="s" kind="neutral" appearance="outline">
                {geoglowsIndex.stats.unverifiedCount} unverified
              </CalciteChip>
              {streamsMeta?.featureCount && (
                <CalciteChip scale="s" kind="neutral" appearance="outline">
                  {streamsMeta.featureCount.toLocaleString()} local FIDs
                </CalciteChip>
              )}
            </div>
          )}
        </div>
      </CalciteBlock>

      {/* Reach Search & Verification Crosswalk */}
      <CalciteBlock
        open
        heading="Verified Reach Selection & Crosswalk"
        description="Search verified LINKNOs or local river names (UTM 37S spatial match)"
      >
        <div className="flex flex-col gap-2">
          <CalciteInput
            scale="s"
            type="search"
            clearable
            placeholder="Search river name (e.g. Tana, Sagana, Thika) or LINKNO..."
            value={searchText}
            onCalciteInputInput={(e) =>
              setSearchText(String((e.target as HTMLCalciteInputElement).value || ''))
            }
          />

          <CalciteSegmentedControl
            scale="s"
            width="full"
            onCalciteSegmentedControlChange={(e) =>
              setListMode((e.target as HTMLCalciteSegmentedControlElement).value as ReachListMode)
            }
          >
            <CalciteSegmentedControlItem value="matched" checked={listMode === 'matched'}>
              Matched Local
            </CalciteSegmentedControlItem>
            <CalciteSegmentedControlItem value="all_geoglows" checked={listMode === 'all_geoglows'}>
              All GEOGLOWS AOI
            </CalciteSegmentedControlItem>
            <CalciteSegmentedControlItem
              value="unverified_local"
              checked={listMode === 'unverified_local'}
            >
              Unverified
            </CalciteSegmentedControlItem>
          </CalciteSegmentedControl>

          {geoglowsIndexLoading ? (
            <div className="py-4 flex justify-center">
              <CalciteLoader
                scale="s"
                label="Building Tana GEOGLOWS Reach Index"
                text="Cross-referencing TDX-Hydro reaches & local Tana streams..."
              />
            </div>
          ) : geoglowsIndexError ? (
            <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
              <div slot="title">Reach Index Error</div>
              <div slot="message">{geoglowsIndexError}</div>
              <CalciteButton
                slot="actions-end"
                scale="s"
                appearance="outline"
                onClick={onReloadGeoglowsIndex}
              >
                Retry
              </CalciteButton>
            </CalciteNotice>
          ) : listMode === 'unverified_local' ? (
            <div className="max-h-44 overflow-y-auto">
              <CalciteList selectionMode="single" scale="s">
                {filteredUnverified.map((m) => (
                  <CalciteListItem
                    key={m.tana_feature_id}
                    label={m.tana_name || `Unnamed Local Reach #${m.tana_feature_id}`}
                    description={`FID #${m.tana_feature_id} · ${(m.tana_length_m / 1000).toFixed(2)} km · ${m.reason}`}
                    selected={m.tana_feature_id === selectedStreamFid && Boolean(geoglowsUnverifiedMsg)}
                    onCalciteListItemSelect={() => onSelectLocalStream(m.tana_feature_id, true)}
                  />
                ))}
              </CalciteList>
            </div>
          ) : filteredReaches.length === 0 ? (
            <CalciteNotice open kind="info" scale="s" icon="search">
              <div slot="message">No GEOGLOWS reaches matched &ldquo;{searchText}&rdquo;.</div>
            </CalciteNotice>
          ) : (
            <div className="max-h-44 overflow-y-auto">
              <CalciteList selectionMode="single" scale="s">
                {filteredReaches.map((r) => (
                  <CalciteListItem
                    key={r.linkno}
                    label={r.displayName}
                    description={`LINKNO ${r.linkno} · Order ${r.streamOrder} · UPA ${r.upstreamAreaKm2.toFixed(0)} km² · ${(r.geodesicLengthMeters / 1000).toFixed(1)} km`}
                    selected={r.linkno === selectedLinkno && !geoglowsUnverifiedMsg}
                    onCalciteListItemSelect={() => onSelectGeoglowsReach(r.linkno, true)}
                  >
                    <CalciteAction
                      slot="actions-end"
                      scale="s"
                      icon="zoom-to-object"
                      text={`Zoom to LINKNO ${r.linkno}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectGeoglowsReach(r.linkno, true);
                      }}
                    />
                  </CalciteListItem>
                ))}
              </CalciteList>
            </div>
          )}
        </div>
      </CalciteBlock>

      {geoglowsUnverifiedMsg ? (
        <CalciteNotice open kind="warning" scale="m" icon="exclamation-mark-triangle">
          <div slot="title">{geoglowsUnverifiedMsg}</div>
          <div slot="message">
            {selectedTanaMatch
              ? `Local Segment FID #${selectedTanaMatch.tana_feature_id} (${
                  selectedTanaMatch.tana_name || 'Unnamed'
                }): ${selectedTanaMatch.reason}. GEOGLOWS queries are withheld to prevent hydrological misattribution.`
              : 'Select a verified GEOGLOWS reach above or click a river reach directly on the map.'}
          </div>
        </CalciteNotice>
      ) : selectedReach ? (
        <div className="flex flex-col gap-3">
          {/* Active Reach Summary + Non-Alarmist Signal Banner */}
          <CalciteCard scale="s">
            <span slot="heading">{selectedReach.displayName}</span>
            <span slot="description" style={{ fontFamily: 'var(--calcite-code-family)' }}>
              LINKNO {selectedReach.linkno} · VPU {selectedReach.vpu ?? 103} · Order {selectedReach.streamOrder} · {damPosLabel(selectedReach.damPosition)}
            </span>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {analysis && (
                  <CalciteChip
                    scale="s"
                    kind="neutral"
                    appearance="outline-fill"
                    style={{
                      '--calcite-chip-border-color': signalToneToken(analysis.signalClass),
                    } as React.CSSProperties}
                  >
                    {analysis.signalClass}
                  </CalciteChip>
                )}
                <CalciteChip scale="s" kind="brand" appearance="outline-fill">
                  UPA: {selectedReach.upstreamAreaKm2.toFixed(1)} km²
                </CalciteChip>
                {selectedTanaMatch && (
                  <CalciteChip scale="s" kind="neutral" appearance="outline">
                    FID #{selectedTanaMatch.tana_feature_id} ({selectedTanaMatch.match_confidence})
                  </CalciteChip>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  iconStart="zoom-to-object"
                  onClick={() => onZoomToGeoglowsReach(selectedReach.linkno)}
                >
                  Zoom Reach
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  kind="brand"
                  appearance="outline"
                  iconStart="layers-reference"
                  onClick={() => onNavigateWorkspace('impact_exposure')}
                >
                  Screen Exposure
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="transparent"
                  iconStart="information"
                  onClick={() => onOpenIndicatorInfo('ind_geoglows_forecast_stats')}
                >
                  Provenance
                </CalciteButton>
              </div>
            </div>
          </CalciteCard>

          <CalciteTabs scale="s" layout="center">
            <CalciteTabNav slot="tab-nav">
              <CalciteTabTitle selected>Forecast &amp; Spread</CalciteTabTitle>
              <CalciteTabTitle>Percentiles</CalciteTabTitle>
              <CalciteTabTitle>Historical</CalciteTabTitle>
              <CalciteTabTitle>Return Periods</CalciteTabTitle>
            </CalciteTabNav>

            {/* TAB 1: FORECAST STATS (51 MEMBERS) vs SEPARATE HRES */}
            <CalciteTab selected>
              <div className="pt-2.5 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  {forecast?.availableDates && forecast.availableDates.length > 0 && (
                    <CalciteLabel scale="s" className="flex-1 mb-0">
                      Forecast Issue Run (UTC)
                      <CalciteSelect
                        scale="s"
                        label="Forecast issue date"
                        value={issueDate || forecast.availableDates[0]}
                        onCalciteSelectChange={(e) => {
                          setIssueDate(String((e.target as HTMLCalciteSelectElement).value));
                        }}
                      >
                        {forecast.availableDates.slice(0, 14).map((d) => (
                          <CalciteOption
                            key={d}
                            value={d}
                            selected={d === (issueDate || forecast.availableDates[0])}
                          >
                            {formatIssueDateLabel(d)}
                          </CalciteOption>
                        ))}
                      </CalciteSelect>
                    </CalciteLabel>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pb-1 text-xs">
                    <label className="inline-flex items-center gap-1.5">
                      <CalciteSwitch
                        scale="s"
                        checked={showEnsembles}
                        label="Show 52 ensemble members"
                        onCalciteSwitchChange={(e) =>
                          setShowEnsembles(Boolean((e.target as HTMLCalciteSwitchElement).checked))
                        }
                      />
                      <span>Members</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <CalciteSwitch
                        scale="s"
                        checked={showHighRes}
                        label="Show separate 10d HRES member"
                        onCalciteSwitchChange={(e) =>
                          setShowHighRes(Boolean((e.target as HTMLCalciteSwitchElement).checked))
                        }
                      />
                      <span>10d HRES</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <CalciteSwitch
                        scale="s"
                        checked={showReturnOverlay}
                        label="Show return period thresholds"
                        onCalciteSwitchChange={(e) =>
                          setShowReturnOverlay(Boolean((e.target as HTMLCalciteSwitchElement).checked))
                        }
                      />
                      <span>RP Lines</span>
                    </label>
                  </div>
                </div>

                {forecastLoading ? (
                  <div className="py-6 flex justify-center">
                    <CalciteLoader
                      scale="m"
                      label="Fetching GEOGLOWS ECMWF Forecast"
                      text={`Loading forecaststats for LINKNO ${selectedReach.linkno}...`}
                    />
                  </div>
                ) : forecastError ? (
                  <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
                    <div slot="title">GEOGLOWS Forecast Unavailable</div>
                    <div slot="message">{forecastError}</div>
                  </CalciteNotice>
                ) : forecast ? (
                  <>
                    <div
                      className="text-xs px-2 py-1.5 rounded flex flex-wrap gap-x-3 gap-y-0.5"
                      style={{
                        backgroundColor: 'var(--calcite-color-foreground-2)',
                        border: '1px solid var(--calcite-color-border-3)',
                        fontFamily: 'var(--calcite-code-family)',
                        color: 'var(--calcite-color-text-2)',
                      }}
                    >
                      <span>Issue: {forecast.metadata.gen_date || 'Latest'} UTC</span>
                      <span>Units: m³/s</span>
                      <span>Model: ECMWF GEOGLOWS v2</span>
                    </div>

                    {ensemblesLoading && (
                      <div className="flex items-center gap-2 text-xs">
                        <CalciteLoader inline scale="s" label="Loading ensemble members" />
                        <span>Loading individual ensemble trajectories...</span>
                      </div>
                    )}
                    {ensemblesError && (
                      <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
                        <div slot="message">{ensemblesError}</div>
                      </CalciteNotice>
                    )}

                    <CalciteCard scale="s">
                      <ForecastHydrographChart
                        forecast={forecast}
                        ensembles={ensembles}
                        returnPeriods={returnPeriods}
                        showEnsembles={showEnsembles}
                        showHighRes={showHighRes}
                        showReturnPeriods={showReturnOverlay}
                      />
                    </CalciteCard>

                    {/* Explicit Separation of 51-Member Stats vs 52nd Deterministic HRES */}
                    <CalciteNotice open kind="info" scale="s" icon="information">
                      <div slot="title">51-Member Ensemble vs. Separate 10-Day HRES</div>
                      <div slot="message">
                        Summary percentiles (min, P25, median, mean, P75, max) summarize the 51-member 15-day ensemble only. The single 10-day deterministic HRES trajectory is shown separately and never mixed into ensemble statistics.
                      </div>
                    </CalciteNotice>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <CalciteCard scale="s">
                        <span slot="heading">51-Member Median Peak</span>
                        <div
                          className="text-base font-semibold tabular-nums"
                          style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-brand)' }}
                        >
                          {forecast.peakStats.peakMedianM3s?.toFixed(2) ?? '—'} m³/s
                        </div>
                        <div style={{ color: 'var(--calcite-color-text-3)' }}>
                          {forecast.peakStats.peakMedianTime?.slice(0, 16) || '—'} UTC
                        </div>
                      </CalciteCard>

                      <CalciteCard scale="s">
                        <span slot="heading">Separate 10d HRES Peak</span>
                        <div
                          className="text-base font-semibold tabular-nums"
                          style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-status-warning)' }}
                        >
                          {analysis?.forecastMetrics.peakHresM3s?.toFixed(2) ?? '—'} m³/s
                        </div>
                        <div style={{ color: 'var(--calcite-color-text-3)' }}>
                          Mean diff vs median:{' '}
                          {analysis?.forecastMetrics.hresVsMedianDivergencePct !== null &&
                          analysis?.forecastMetrics.hresVsMedianDivergencePct !== undefined
                            ? `${analysis.forecastMetrics.hresVsMedianDivergencePct >= 0 ? '+' : ''}${analysis.forecastMetrics.hresVsMedianDivergencePct}%`
                            : '—'}
                        </div>
                      </CalciteCard>

                      <CalciteCard scale="s">
                        <span slot="heading">Ensemble Uncertainty (IQR)</span>
                        <div
                          className="text-base font-semibold tabular-nums"
                          style={{ fontFamily: 'var(--calcite-code-family)' }}
                        >
                          {analysis?.forecastMetrics.peakIqrWidthM3s?.toFixed(1) ?? '—'} m³/s
                        </div>
                        <div style={{ color: 'var(--calcite-color-text-3)' }}>
                          Level: {analysis?.forecastMetrics.uncertaintyLevel || 'Computing'} (ratio{' '}
                          {analysis?.forecastMetrics.peakSpreadRatio?.toFixed(2) ?? '—'})
                        </div>
                      </CalciteCard>

                      <CalciteCard scale="s">
                        <span slot="heading">51-Member Max Peak</span>
                        <div
                          className="text-base font-semibold tabular-nums"
                          style={{ fontFamily: 'var(--calcite-code-family)' }}
                        >
                          {forecast.peakStats.peakMaxEnsembleM3s?.toFixed(2) ?? '—'} m³/s
                        </div>
                        <div style={{ color: 'var(--calcite-color-text-3)' }}>
                          {analysis?.exceedance.highestExceededRpByMaxEnsemble || ''}
                        </div>
                      </CalciteCard>
                    </div>
                  </>
                ) : null}
              </div>
            </CalciteTab>

            {/* TAB 2: HISTORICAL PERCENTILES & SIGNAL SUMMARY */}
            <CalciteTab>
              <div className="pt-2.5 flex flex-col gap-2.5">
                {analysisLoading ? (
                  <div className="py-6 flex justify-center">
                    <CalciteLoader scale="m" label="Computing historical percentile ranking" />
                  </div>
                ) : analysis ? (
                  <>
                    <CalciteCard scale="s">
                      <span slot="heading">Forecast Rank vs. 1940–Present Modelled History</span>
                      <span slot="description">
                        Empirical rank across {analysis.historicalSampleSize.toLocaleString()} simulated monthly steps
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div style={{ color: 'var(--calcite-color-text-3)' }}>Peak Percentile</div>
                          <div
                            className="text-base font-semibold tabular-nums"
                            style={{ fontFamily: 'var(--calcite-code-family)', color: 'var(--calcite-color-brand)' }}
                          >
                            {analysis.forecastMetrics.peakMedianHistoricalPercentile ?? '—'}th
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--calcite-color-text-3)' }}>Ratio to Matched Month</div>
                          <div
                            className="text-base font-semibold tabular-nums"
                            style={{ fontFamily: 'var(--calcite-code-family)' }}
                          >
                            {analysis.forecastMetrics.peakMedianVsMatchedMonthRatio?.toFixed(2) ?? '—'}×
                          </div>
                          <div style={{ color: 'var(--calcite-color-text-3)' }}>
                            Month median: {analysis.historicalPercentiles.matchedMonthMedian?.toFixed(1) ?? '—'} m³/s
                          </div>
                        </div>
                      </div>
                      <CalciteButton
                        slot="footer-end"
                        scale="s"
                        appearance="outline"
                        iconStart="information"
                        onClick={() => onOpenIndicatorInfo('ind_geoglows_hist_percentile')}
                      >
                        Method
                      </CalciteButton>
                    </CalciteCard>

                    <CalciteTable
                      caption="Empirical Historical Discharge Percentiles (1940–Present Simulated)"
                      scale="s"
                      bordered
                      striped
                    >
                      <CalciteTableRow slot="table-header">
                        <CalciteTableHeader heading="Statistic" />
                        <CalciteTableHeader heading="Flow (m³/s)" />
                      </CalciteTableRow>
                      {[
                        ['10th Percentile (Low Flow Reference)', analysis.historicalPercentiles.p10],
                        ['25th Percentile', analysis.historicalPercentiles.p25],
                        ['50th Percentile (All-Months Median)', analysis.historicalPercentiles.p50],
                        ['Matched Calendar-Month Median', analysis.historicalPercentiles.matchedMonthMedian],
                        ['75th Percentile', analysis.historicalPercentiles.p75],
                        ['90th Percentile (High Flow Reference)', analysis.historicalPercentiles.p90],
                      ].map(([lbl, val]) => (
                        <CalciteTableRow key={String(lbl)}>
                          <CalciteTableCell>{lbl}</CalciteTableCell>
                          <CalciteTableCell>
                            <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                              {typeof val === 'number' ? val.toFixed(2) : '—'}
                            </span>
                          </CalciteTableCell>
                        </CalciteTableRow>
                      ))}
                    </CalciteTable>

                    <CalciteCard scale="s">
                      <span slot="heading">Analytical Interpretation</span>
                      <ul className="m-0 pl-4 text-xs flex flex-col gap-1" style={{ color: 'var(--calcite-color-text-2)' }}>
                        {analysis.interpretationBullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </CalciteCard>

                    <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
                      <div slot="title">Model Provenance &amp; Guardrails</div>
                      <div slot="message">{analysis.limitations.join(' ')}</div>
                    </CalciteNotice>
                  </>
                ) : (
                  <CalciteNotice open kind="info" scale="s" icon="information">
                    <div slot="message">Select a verified GEOGLOWS reach to compute historical percentiles.</div>
                  </CalciteNotice>
                )}
              </div>
            </CalciteTab>

            {/* TAB 3: HISTORICAL RETROSPECTIVE */}
            <CalciteTab>
              <div className="pt-2.5 flex flex-col gap-2.5">
                <CalciteNotice open kind="info" scale="s" icon="clock">
                  <div slot="title">GEOGLOWS Retrospective Simulation (1940–Present)</div>
                  <div slot="message">
                    Modelled ECMWF ERA5-Land runoff routing — not local Kenyan WRA river gauge telemetry.
                  </div>
                </CalciteNotice>

                <CalciteSegmentedControl
                  scale="s"
                  width="full"
                  onCalciteSegmentedControlChange={(e) =>
                    setHistMode((e.target as HTMLCalciteSegmentedControlElement).value as HistoricalMode)
                  }
                >
                  <CalciteSegmentedControlItem value="monthly" checked={histMode === 'monthly'}>
                    Monthly
                  </CalciteSegmentedControlItem>
                  <CalciteSegmentedControlItem value="daily" checked={histMode === 'daily'}>
                    Daily
                  </CalciteSegmentedControlItem>
                  <CalciteSegmentedControlItem value="annual" checked={histMode === 'annual'}>
                    Annual
                  </CalciteSegmentedControlItem>
                  <CalciteSegmentedControlItem
                    value="monthly_climatology"
                    checked={histMode === 'monthly_climatology'}
                  >
                    Monthly Clim
                  </CalciteSegmentedControlItem>
                </CalciteSegmentedControl>

                {(histMode === 'daily' || histMode === 'monthly') && (
                  <div className="flex flex-wrap items-end gap-2">
                    <CalciteLabel scale="s" className="mb-0 flex-1">
                      Start (YYYYMMDD)
                      <CalciteInput
                        scale="s"
                        value={histStart}
                        onCalciteInputChange={(e) =>
                          setHistStart(String((e.target as HTMLCalciteInputElement).value || '20180101'))
                        }
                      />
                    </CalciteLabel>
                    <CalciteLabel scale="s" className="mb-0 flex-1">
                      End (YYYYMMDD)
                      <CalciteInput
                        scale="s"
                        value={histEnd}
                        onCalciteInputChange={(e) =>
                          setHistEnd(String((e.target as HTMLCalciteInputElement).value || '20251231'))
                        }
                      />
                    </CalciteLabel>
                    <CalciteButton
                      scale="s"
                      appearance="outline"
                      onClick={() => {
                        setHistMode('monthly');
                        setHistStart('20230101');
                        setHistEnd('20241231');
                      }}
                    >
                      El Niño 2023–24
                    </CalciteButton>
                    <CalciteButton
                      scale="s"
                      appearance="outline"
                      onClick={() => {
                        setHistStart('20180101');
                        setHistEnd('20251231');
                      }}
                    >
                      2018–2025
                    </CalciteButton>
                  </div>
                )}

                {histLoading ? (
                  <div className="py-6 flex justify-center">
                    <CalciteLoader scale="m" label="Loading historical retrospective" />
                  </div>
                ) : histError ? (
                  <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
                    <div slot="message">{histError}</div>
                  </CalciteNotice>
                ) : historical ? (
                  <>
                    <CalciteCard scale="s">
                      <HistoricalStreamflowChart data={historical} returnPeriods={returnPeriods} />
                    </CalciteCard>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <CalciteCard scale="s">
                        <span slot="heading">Mean</span>
                        <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {historical.summary.meanM3s?.toFixed(2) ?? '—'} m³/s
                        </div>
                      </CalciteCard>
                      <CalciteCard scale="s">
                        <span slot="heading">Peak</span>
                        <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {historical.summary.maxM3s?.toFixed(2) ?? '—'} m³/s
                        </div>
                        <div style={{ color: 'var(--calcite-color-text-3)' }}>
                          {historical.summary.maxDate || '—'}
                        </div>
                      </CalciteCard>
                      <CalciteCard scale="s">
                        <span slot="heading">Low</span>
                        <div className="font-semibold tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                          {historical.summary.minM3s?.toFixed(2) ?? '—'} m³/s
                        </div>
                        <div style={{ color: 'var(--calcite-color-text-3)' }}>
                          {historical.summary.minDate || '—'}
                        </div>
                      </CalciteCard>
                    </div>
                  </>
                ) : null}
              </div>
            </CalciteTab>

            {/* TAB 4: RETURN PERIODS & EXCEEDANCE DURATION */}
            <CalciteTab>
              <div className="pt-2.5 flex flex-col gap-2.5">
                <CalciteNotice open kind="warning" scale="s" icon="exclamation-mark-triangle">
                  <div slot="title">Model-Derived Statistical Thresholds Only</div>
                  <div slot="message">
                    Return periods use Gumbel Type I distributions fit to 1940–present modelled maxima. Exceedance signals elevated modelled flow—NOT verified flood inundation or official Kenyan WRA warnings.
                  </div>
                </CalciteNotice>

                {analysis && (
                  <CalciteCard scale="s">
                    <span slot="heading">Forecast Threshold Duration Summary</span>
                    <div className="grid grid-cols-2 gap-2 text-xs tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                      <div>Median ≥ 2-yr RP: {analysis.exceedance.hoursAboveRp2Median} h ({analysis.exceedance.pctHorizonAboveRp2Median}%)</div>
                      <div>Median ≥ 5-yr RP: {analysis.exceedance.hoursAboveRp5Median} h</div>
                      <div>Median ≥ 10-yr RP: {analysis.exceedance.hoursAboveRp10Median} h</div>
                      <div>Max Member ≥ 2-yr RP: {analysis.exceedance.hoursAboveRp2MaxEnsemble} h</div>
                    </div>
                    <CalciteButton
                      slot="footer-end"
                      scale="s"
                      appearance="outline"
                      iconStart="information"
                      onClick={() => onOpenIndicatorInfo('ind_geoglows_rp_exceedance')}
                    >
                      RP Method
                    </CalciteButton>
                  </CalciteCard>
                )}

                {rpLoading ? (
                  <div className="py-6 flex justify-center">
                    <CalciteLoader scale="m" label="Loading return-period thresholds" />
                  </div>
                ) : rpError ? (
                  <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
                    <div slot="message">{rpError}</div>
                  </CalciteNotice>
                ) : returnPeriods ? (
                  <CalciteTable
                    caption={`GEOGLOWS Return Periods for LINKNO ${returnPeriods.linkno}`}
                    scale="s"
                    bordered
                    striped
                  >
                    <CalciteTableRow slot="table-header">
                      <CalciteTableHeader heading="Return Period" />
                      <CalciteTableHeader heading="Gumbel (m³/s)" />
                      <CalciteTableHeader heading="Gumbel Daily" />
                      <CalciteTableHeader heading="Forecast Median" />
                    </CalciteTableRow>
                    {(
                      [
                        ['2-Year', returnPeriods.thresholds.rp2, returnPeriods.gumbelDaily?.rp2],
                        ['5-Year', returnPeriods.thresholds.rp5, returnPeriods.gumbelDaily?.rp5],
                        ['10-Year', returnPeriods.thresholds.rp10, returnPeriods.gumbelDaily?.rp10],
                        ['25-Year', returnPeriods.thresholds.rp25, returnPeriods.gumbelDaily?.rp25],
                        ['50-Year', returnPeriods.thresholds.rp50, returnPeriods.gumbelDaily?.rp50],
                        ['100-Year', returnPeriods.thresholds.rp100, returnPeriods.gumbelDaily?.rp100],
                      ] as Array<[string, number | null, number | null | undefined]>
                    ).map(([label, val, dailyVal]) => {
                      const peakMed = forecast?.peakStats.peakMedianM3s ?? null;
                      const status =
                        val && peakMed !== null
                          ? peakMed >= val
                            ? 'Exceeding'
                            : peakMed >= val * 0.8
                            ? 'Approaching'
                            : 'Below'
                          : '—';
                      return (
                        <CalciteTableRow key={label}>
                          <CalciteTableCell>{label}</CalciteTableCell>
                          <CalciteTableCell>
                            <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                              {val !== null ? val.toFixed(2) : '—'}
                            </span>
                          </CalciteTableCell>
                          <CalciteTableCell>
                            <span className="tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                              {typeof dailyVal === 'number' ? dailyVal.toFixed(2) : '—'}
                            </span>
                          </CalciteTableCell>
                          <CalciteTableCell>{status}</CalciteTableCell>
                        </CalciteTableRow>
                      );
                    })}
                  </CalciteTable>
                ) : null}

                {/* Reach Coordinate Catchment Snapshot */}
                <CalciteBlock collapsible heading="Reach Corridor EO Context" description="Local grid cells at reach centroid">
                  {ctxLoading ? (
                    <CalciteLoader inline scale="s" label="Probing corridor EO context" />
                  ) : ctxError ? (
                    <CalciteNotice open kind="warning" scale="s">
                      <div slot="message">{ctxError}</div>
                    </CalciteNotice>
                  ) : reachContext ? (
                    <div className="grid grid-cols-2 gap-2 text-xs tabular-nums" style={{ fontFamily: 'var(--calcite-code-family)' }}>
                      <div>CHIRPS Anom: {reachContext.climate.chirpsAnomPct?.toFixed(1) ?? '—'}%</div>
                      <div>ERA5 SM Anom: {reachContext.soil.smRootZoneAnom?.toFixed(4) ?? '—'}</div>
                      <div>Elevation: {reachContext.terrainAndWater.elevationM?.toFixed(0) ?? '—'} m</div>
                      <div>HAND: {reachContext.terrainAndWater.handM?.toFixed(1) ?? '—'} m</div>
                    </div>
                  ) : null}
                </CalciteBlock>
              </div>
            </CalciteTab>
          </CalciteTabs>
        </div>
      ) : (
        <CalciteNotice open kind="info" scale="s" icon="cursor-click">
          <div slot="title">Select a Verified Reach</div>
          <div slot="message">
            Choose a verified Tana river reach above or click any stream on the map to query live GEOGLOWS ECMWF streamflow forecasts and percentile statistics.
          </div>
        </CalciteNotice>
      )}
    </div>
  );
}
