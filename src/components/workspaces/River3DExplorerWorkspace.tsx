import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react';
import {
  CalciteButton,
  CalciteCard,
  CalciteLabel,
  CalciteLoader,
  CalciteNotice,
  CalciteSelect,
  CalciteSlider,
} from '@esri/calcite-components-react';
import {
  fetchGeoglowsEnsembles,
  fetchGeoglowsForecast,
  fetchGeoglowsHistorical,
} from '../../services/geoglows/geoglowsService';
import { queryRiverTerrainProfile, type RiverTerrainProfile } from '../../services/arcgis/riverTerrainProfile';
import type {
  AppModuleId,
  GeoglowsEnsembleBundle,
  GeoglowsForecastBundle,
  GeoglowsHistoricalResponse,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
  RiverJourneyCameraTarget,
  RiverProfileMarker,
  SubBasinPolygon,
} from '../../types/geospatial';
import {
  buildDownstreamRiverJourney,
  cameraTargetForJourneySample,
  pointInSubBasin,
  sampleRiverJourney,
  type RiverJourneySample,
} from '../../utils/riverJourney';
import { ForecastHydrographChart } from '../rivers/GeoglowsHydrograph';

interface River3DExplorerWorkspaceProps {
  subBasins: SubBasinPolygon[];
  subBasinsLoading: boolean;
  subBasinsError: string | null;
  onReloadSubBasins: () => void;
  selectedHybasId: number | 'all';
  onSelectHybasId: (id: number | 'all') => void;
  geoglowsIndex: GeoglowsReachIndexResponse | null;
  geoglowsIndexLoading: boolean;
  geoglowsIndexError: string | null;
  selectedLinkno: number | null;
  mapMode: '2d' | '3d';
  onMapModeChange: (mode: '2d' | '3d') => void;
  onSelectGeoglowsReach: (linkno: number | null, zoom?: boolean) => void;
  onResetHome: () => void;
  onJourneyTargetChange: (target: RiverJourneyCameraTarget) => void;
  onProfileMarkerChange: (marker: RiverProfileMarker | null) => void;
  geoglowsForecastTimeMs: number | null;
  onChangeGeoglowsTimeMs: (timeMs: number) => void;
  onNavigateWorkspace: (workspace: AppModuleId) => void;
  demoFollowNonce: number;
  demoRunning: boolean;
  demoPaused: boolean;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatIssueDate(value: string): string {
  if (/^\d{10}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:00 UTC`;
  }
  return value;
}

function parseForecastTimestamp(value: string): number | null {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const timeMs = Date.parse(normalized);
  return Number.isFinite(timeMs) ? timeMs : null;
}

function reachLabel(reach: GeoglowsReachRecord): string {
  const name = reach.matchedLocalNames[0] || 'Unnamed local Tana reach';
  return `${name} · LINKNO ${reach.linkno} · ${reach.upstreamAreaKm2.toLocaleString()} km² upstream`;
}

export function River3DExplorerWorkspace({
  subBasins,
  subBasinsLoading,
  subBasinsError,
  onReloadSubBasins,
  selectedHybasId,
  onSelectHybasId,
  geoglowsIndex,
  geoglowsIndexLoading,
  geoglowsIndexError,
  selectedLinkno,
  mapMode,
  onMapModeChange,
  onSelectGeoglowsReach,
  onResetHome,
  onJourneyTargetChange,
  onProfileMarkerChange,
  geoglowsForecastTimeMs,
  onChangeGeoglowsTimeMs,
  onNavigateWorkspace,
  demoFollowNonce,
  demoRunning,
  demoPaused,
}: River3DExplorerWorkspaceProps) {
  const [startLinkno, setStartLinkno] = useState<number | null>(null);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoveredProfileIndex, setHoveredProfileIndex] = useState<number | null>(null);
  const [profile, setProfile] = useState<RiverTerrainProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<GeoglowsForecastBundle | null>(null);
  const [ensembles, setEnsembles] = useState<GeoglowsEnsembleBundle | null>(null);
  const [historical, setHistorical] = useState<GeoglowsHistoricalResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [ensembleError, setEnsembleError] = useState<string | null>(null);
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [forecastIndex, setForecastIndex] = useState(0);
  const lastDemoFollowNonce = useRef(0);

  const studyAreaReaches = useMemo(() => {
    if (!geoglowsIndex || subBasins.length === 0) return [];
    return geoglowsIndex.reaches.filter(
      (reach) =>
        subBasins.some((subBasin) =>
          pointInSubBasin(reach.centroid[0], reach.centroid[1], subBasin)
        )
    );
  }, [geoglowsIndex, subBasins]);
  const verifiedStudyAreaReaches = useMemo(
    () => studyAreaReaches.filter((reach) => reach.matchedFids.length > 0),
    [studyAreaReaches]
  );

  const startCandidates = useMemo(() => {
    if (!geoglowsIndex || subBasins.length === 0) return [];
    const subBasinReaches =
      selectedHybasId === 'all'
        ? verifiedStudyAreaReaches
        : verifiedStudyAreaReaches.filter((reach) => {
            const subBasin = subBasins.find((item) => item.hybasId === selectedHybasId);
            return Boolean(
              subBasin && pointInSubBasin(reach.centroid[0], reach.centroid[1], subBasin)
            );
          });
    return [...subBasinReaches].sort(
      (a, b) => a.upstreamAreaKm2 - b.upstreamAreaKm2
    );
  }, [geoglowsIndex, selectedHybasId, subBasins, verifiedStudyAreaReaches]);

  const downstreamJourney = useMemo(
    () =>
      startLinkno === null
        ? null
        : buildDownstreamRiverJourney(startLinkno, studyAreaReaches),
    [startLinkno, studyAreaReaches]
  );
  const journeySamples = useMemo(
    () => (downstreamJourney ? sampleRiverJourney(downstreamJourney) : []),
    [downstreamJourney]
  );
  const selectedReach =
    selectedLinkno === null
      ? null
      : verifiedStudyAreaReaches.find((reach) => reach.linkno === selectedLinkno) || null;

  useEffect(() => {
    if (startCandidates.length === 0) {
      setStartLinkno(null);
      setIsPlaying(false);
      return;
    }
    const preferred =
      (selectedLinkno !== null &&
      startCandidates.some((reach) => reach.linkno === selectedLinkno)
        ? selectedLinkno
        : null) ??
      (startLinkno !== null && startCandidates.some((reach) => reach.linkno === startLinkno)
        ? startLinkno
        : startCandidates[0].linkno);
    if (preferred !== startLinkno) setStartLinkno(preferred);
  }, [selectedHybasId, selectedLinkno, startCandidates, startLinkno]);

  useEffect(() => {
    setIsPlaying(false);
    setSampleIndex(0);
  }, [startLinkno, journeySamples]);

  useEffect(() => {
    if (startLinkno !== null) onSelectGeoglowsReach(startLinkno);
  }, [startLinkno, onSelectGeoglowsReach]);

  useEffect(() => {
    if (journeySamples.length === 0) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);
    queryRiverTerrainProfile(journeySamples, controller.signal)
      .then((result) => {
        setProfile(result);
        setProfileLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setProfileError(
          error instanceof Error ? error.message : 'Terrain elevation sampling failed.'
        );
        setProfileLoading(false);
      });
    return () => controller.abort();
  }, [journeySamples]);

  useEffect(() => {
    if (selectedLinkno === null || !selectedReach) {
      setForecast(null);
      setEnsembles(null);
      setHistorical(null);
      setForecastError(null);
      return;
    }
    const controller = new AbortController();
    setForecastLoading(true);
    setForecastError(null);
    setEnsembleError(null);
    setHistoricalError(null);
    const selectedIssue = issueDate || null;

    Promise.allSettled([
      fetchGeoglowsForecast(selectedLinkno, selectedIssue, controller.signal),
      fetchGeoglowsEnsembles(selectedLinkno, selectedIssue, controller.signal),
      fetchGeoglowsHistorical(
        selectedLinkno,
        'monthly',
        '20010101',
        '20251231',
        controller.signal
      ),
    ]).then(([forecastResult, ensembleResult, historyResult]) => {
      if (controller.signal.aborted) return;
      if (forecastResult.status === 'fulfilled') {
        setForecast(forecastResult.value);
        setForecastIndex(0);
      } else {
        setForecast(null);
        setForecastError(
          forecastResult.reason instanceof Error
            ? forecastResult.reason.message
            : 'GEOGLOWS forecast request failed.'
        );
      }
      if (ensembleResult.status === 'fulfilled') {
        setEnsembles(ensembleResult.value);
      } else {
        setEnsembles(null);
        setEnsembleError(
          ensembleResult.reason instanceof Error
            ? ensembleResult.reason.message
            : 'GEOGLOWS ensemble request failed.'
        );
      }
      if (historyResult.status === 'fulfilled') {
        setHistorical(historyResult.value);
      } else {
        setHistorical(null);
        setHistoricalError(
          historyResult.reason instanceof Error
            ? historyResult.reason.message
            : 'GEOGLOWS historical request failed.'
        );
      }
      setForecastLoading(false);
    });

    return () => controller.abort();
  }, [selectedLinkno, selectedReach, issueDate]);

  useEffect(() => {
    if (hoveredProfileIndex === null || !profile) {
      onProfileMarkerChange(null);
      return;
    }
    const sample = profile.samples[hoveredProfileIndex];
    onProfileMarkerChange(
      sample ? { longitude: sample.longitude, latitude: sample.latitude } : null
    );
  }, [hoveredProfileIndex, onProfileMarkerChange, profile]);

  useEffect(() => {
    if (!isPlaying || journeySamples.length < 2) return;
    const nextIndex = sampleIndex + 1;
    const timer = window.setTimeout(() => {
      if (nextIndex >= journeySamples.length) {
        setIsPlaying(false);
        return;
      }
      moveToSample(nextIndex);
    }, 1400 / speed);
    return () => window.clearTimeout(timer);
    // moveToSample only closes over stable state setters and current journeySamples.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, journeySamples.length, sampleIndex, speed]);

  const moveToSample = useCallback(
    (index: number) => {
      const sample = journeySamples[index];
      if (!sample) return;
      onMapModeChange('3d');
      onJourneyTargetChange(
        cameraTargetForJourneySample(sample, Math.round(1200 / speed), Date.now())
      );
      onProfileMarkerChange({ longitude: sample.longitude, latitude: sample.latitude });
      setSampleIndex(index);
    },
    [journeySamples, onJourneyTargetChange, onMapModeChange, onProfileMarkerChange, speed]
  );

  useEffect(() => {
    if (!demoRunning || demoPaused) {
      setIsPlaying(false);
      return;
    }

    if (demoFollowNonce > lastDemoFollowNonce.current) {
      if (downstreamJourney?.downstreamDirectionVerified && journeySamples.length > 1) {
        lastDemoFollowNonce.current = demoFollowNonce;
        moveToSample(0);
        setIsPlaying(true);
      } else if (!geoglowsIndexLoading && !subBasinsLoading && startCandidates.length === 0) {
        lastDemoFollowNonce.current = demoFollowNonce;
        setIsPlaying(false);
      }
      return;
    }

    if (downstreamJourney?.downstreamDirectionVerified && journeySamples.length > 1) {
      setIsPlaying(true);
    }
  }, [
    demoFollowNonce,
    demoPaused,
    demoRunning,
    downstreamJourney,
    geoglowsIndexLoading,
    journeySamples,
    moveToSample,
    startCandidates.length,
    subBasinsLoading,
  ]);

  const handleProfilePointer = (
    event: PointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>,
    activate = false
  ) => {
    if (!profile || profile.samples.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * 640;
    const plotLeft = 44;
    const plotRight = 620;
    const fraction = Math.max(0, Math.min(1, (svgX - plotLeft) / (plotRight - plotLeft)));
    const targetDistance = fraction * (profile.samples.at(-1)?.distanceMeters ?? 0);
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    profile.samples.forEach((sample, index) => {
      const difference = Math.abs(sample.distanceMeters - targetDistance);
      if (difference < nearestDistance) {
        nearestDistance = difference;
        nearestIndex = index;
      }
    });
    setHoveredProfileIndex(nearestIndex);
    if (activate) {
      const sample = profile.samples[nearestIndex];
      let nearestJourneyIndex = 0;
      let nearestJourneyDistance = Infinity;
      journeySamples.forEach((journeySample, index) => {
        const difference = Math.abs(journeySample.distanceMeters - sample.distanceMeters);
        if (difference < nearestJourneyDistance) {
          nearestJourneyDistance = difference;
          nearestJourneyIndex = index;
        }
      });
      moveToSample(nearestJourneyIndex);
    }
  };

  const handleForecastTimeChange = (index: number) => {
    setForecastIndex(index);
    const datetime = forecast?.stats.datetime[index];
    const timeMs = datetime ? parseForecastTimestamp(datetime) : null;
    if (timeMs !== null) onChangeGeoglowsTimeMs(timeMs);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {mapMode !== '3d' && (
        <CalciteNotice open kind="info" icon>
          <div slot="title">3D scene is off</div>
          <div slot="message">
            Switch to the existing SceneView to follow the verified river geometry over terrain.
          </div>
          <CalciteButton
            slot="actions-end"
            appearance="outline"
            scale="s"
            iconStart="globe"
            onClick={() => onMapModeChange('3d')}
          >
            Open 3D
          </CalciteButton>
        </CalciteNotice>
      )}

      <CalciteLabel>
        Study-area sub-basin
        <CalciteSelect
          value={selectedHybasId === 'all' ? 'all' : String(selectedHybasId)}
          disabled={subBasinsLoading || subBasins.length === 0}
          onCalciteSelectChange={(event) => {
            const value = (event.target as HTMLCalciteSelectElement).value;
            onSelectHybasId(value === 'all' ? 'all' : Number(value));
          }}
        >
          <option value="all">All five selected sub-basins</option>
          {subBasins.map((subBasin) => (
            <option key={subBasin.hybasId} value={subBasin.hybasId}>
              {subBasin.name}
            </option>
          ))}
        </CalciteSelect>
      </CalciteLabel>

      <CalciteLabel>
        Verified journey start reach (smallest upstream area first)
        <CalciteSelect
          value={startLinkno === null ? '' : String(startLinkno)}
          disabled={geoglowsIndexLoading || startCandidates.length === 0}
          onCalciteSelectChange={(event) => {
            const linkno = Number((event.target as HTMLCalciteSelectElement).value);
            if (!Number.isInteger(linkno)) return;
            setIsPlaying(false);
            setStartLinkno(linkno);
            onSelectGeoglowsReach(linkno, true);
          }}
        >
          {startCandidates.map((reach) => (
            <option key={reach.linkno} value={reach.linkno}>
              {reachLabel(reach)}
            </option>
          ))}
        </CalciteSelect>
      </CalciteLabel>

      {subBasinsLoading && (
        <CalciteLoader inline label="Loading the five study-area sub-basins" />
      )}
      {subBasinsError && (
        <CalciteNotice open kind="danger" icon>
          <div slot="title">Study-area sub-basins unavailable</div>
          <div slot="message">{subBasinsError}</div>
          <CalciteButton
            slot="actions-end"
            appearance="outline"
            scale="s"
            iconStart="refresh"
            onClick={onReloadSubBasins}
          >
            Retry
          </CalciteButton>
        </CalciteNotice>
      )}
      {geoglowsIndexLoading && <CalciteLoader inline label="Loading verified Tana river reaches" />}
      {geoglowsIndexError && (
        <CalciteNotice open kind="danger" icon>
          <div slot="title">River network unavailable</div>
          <div slot="message">{geoglowsIndexError}</div>
        </CalciteNotice>
      )}
      {!subBasinsLoading && !subBasinsError && subBasins.length === 0 && (
        <CalciteNotice open kind="warning" icon>
          <div slot="title">Study-area geometry unavailable</div>
          <div slot="message">
            No HydroBASINS polygons are available. Reaches are not offered from the bounding box
            alone.
          </div>
        </CalciteNotice>
      )}
      {!geoglowsIndexLoading && subBasins.length > 0 && startCandidates.length === 0 && (
        <CalciteNotice open kind="warning" icon>
          <div slot="title">No verified reaches in this sub-basin</div>
          <div slot="message">
            No reach with a verified local Tana river match falls inside the selected polygon.
            Try another sub-basin or inspect Streamflow Intelligence.
          </div>
        </CalciteNotice>
      )}

      <CalciteCard data-demo-target="terrain-profile">
        <div slot="heading">3D downstream journey</div>
        <div slot="description">
          A downstream link requires one unique GEOGLOWS geometry endpoint within 150 m and a
          larger reported upstream area. Ambiguity or a gap stops the route; outletcomid is not
          used as an immediate-reach connection.
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <CalciteButton
            appearance="solid"
            iconStart={isPlaying ? 'pause' : 'play'}
            disabled={
              journeySamples.length < 2 || !downstreamJourney?.downstreamDirectionVerified
            }
            onClick={() => {
              onMapModeChange('3d');
              if (!isPlaying && sampleIndex >= journeySamples.length - 1) {
                moveToSample(0);
              }
              setIsPlaying((current) => !current);
            }}
          >
            {isPlaying ? 'Pause' : 'Follow river'}
          </CalciteButton>
          <CalciteButton
            appearance="outline"
            iconStart="chevron-left"
            disabled={journeySamples.length === 0 || sampleIndex === 0}
            onClick={() => {
              setIsPlaying(false);
              moveToSample(Math.max(0, sampleIndex - 1));
            }}
          >
            Previous
          </CalciteButton>
          <CalciteButton
            appearance="outline"
            iconStart="chevron-right"
            disabled={journeySamples.length === 0 || sampleIndex >= journeySamples.length - 1}
            onClick={() => {
              setIsPlaying(false);
              moveToSample(Math.min(journeySamples.length - 1, sampleIndex + 1));
            }}
          >
            Next
          </CalciteButton>
          <CalciteButton
            appearance="outline"
            iconStart="home"
            onClick={() => {
              setIsPlaying(false);
              onResetHome();
            }}
          >
            Basin overview
          </CalciteButton>
          <CalciteLabel layout="inline">
            Camera speed
            <CalciteSelect
              value={String(speed)}
              onCalciteSelectChange={(event) =>
                setSpeed(Number((event.target as HTMLCalciteSelectElement).value))
              }
            >
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </CalciteSelect>
          </CalciteLabel>
        </div>
        <div className="px-3 pb-3 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
          {downstreamJourney && (
            <>
              {journeySamples[sampleIndex] && (
                <>
                  Current LINKNO {journeySamples[sampleIndex].linkno}:{' '}
                  {journeySamples[sampleIndex].localMatchVerified
                    ? 'verified to a local Tana reach'
                    : 'GEOGLOWS geometry only; no local Tana match verified'}
                  <br />
                </>
              )}
              {downstreamJourney.segments.length} connected reaches ·{' '}
              {formatDistance(downstreamJourney.distanceMeters)}
              {downstreamJourney.downstreamDirectionVerified
                ? ' · downstream direction verified'
                : ' · downstream direction not verified'}
              {journeySamples[sampleIndex] && (
                <>
                  {' '}
                  · LINKNO {journeySamples[sampleIndex].linkno} ·{' '}
                  {formatDistance(journeySamples[sampleIndex].distanceMeters)} travelled
                </>
              )}
              <br />
              {downstreamJourney.stopReason}
            </>
          )}
        </div>
      </CalciteCard>

      <CalciteCard>
        <div slot="heading">Longitudinal terrain profile</div>
        <div slot="description">
          True, unexaggerated elevation sampled from Esri WorldElevation3D Terrain3D.
        </div>
        <div className="p-3">
          {profileLoading && <CalciteLoader inline label="Sampling terrain elevations" />}
          {profileError && (
            <CalciteNotice open kind="danger" icon>
              <div slot="title">Elevation profile unavailable</div>
              <div slot="message">{profileError}</div>
            </CalciteNotice>
          )}
          {profile && (
            <TerrainProfileChart
              profile={profile}
              onPointer={handleProfilePointer}
              onPointerLeave={() => setHoveredProfileIndex(null)}
            />
          )}
          {profile && (
            <div className="mt-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
              {profile.samples.filter((sample) => sample.elevationMeters !== null).length}/
              {profile.samples.length} elevation samples · nominal spacing{' '}
              {formatDistance(profile.samplingIntervalMeters)}
              {profile.resolutionRangeMeters && (
                <>
                  {' '}
                  · source resolution {Math.round(profile.resolutionRangeMeters[0])}–
                  {Math.round(profile.resolutionRangeMeters[1])} m
                </>
              )}
              {' · '}
              {profile.missingCount} NoData
            </div>
          )}
          {downstreamJourney && !downstreamJourney.downstreamDirectionVerified && (
            <CalciteNotice open kind="warning" icon>
              <div slot="title">Downstream topology not verified</div>
              <div slot="message">
                The elevation profile follows the source geometry order only. It is not presented
                as a downstream profile, and camera playback is disabled.
              </div>
            </CalciteNotice>
          )}
          {profile && (
            <TerrainProfileSummary
              profile={profile}
              downstreamDirectionVerified={Boolean(downstreamJourney?.downstreamDirectionVerified)}
            />
          )}
          {profile &&
            hoveredProfileIndex !== null &&
            profile.samples[hoveredProfileIndex] && (
              <div className="mt-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                Profile position {formatDistance(profile.samples[hoveredProfileIndex].distanceMeters)}
                {' · '}
                {profile.samples[hoveredProfileIndex].elevationMeters === null
                  ? 'NoData'
                  : `${profile.samples[hoveredProfileIndex].elevationMeters?.toFixed(1)} m`}
                {' · '}LINKNO {profile.samples[hoveredProfileIndex].linkno}
              </div>
            )}
          <div className="mt-2 text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
            Sampling uses the source terrain service at automatic available resolution. This is a
            terrain profile, not a measured channel bed or hydraulic energy slope.
          </div>
        </div>
      </CalciteCard>

      <CalciteCard>
        <div slot="heading">Selected-reach streamflow</div>
        <div slot="description">
          GEOGLOWS ECMWF reach forecast and modelled retrospective streamflow; not gauge observations.
        </div>
        <div className="p-3">
          {selectedReach && (
            <div className="mb-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
              {reachLabel(selectedReach)} · local match verified through Tana FeatureServer geometry
            </div>
          )}
          {forecast?.availableDates.length ? (
            <CalciteLabel>
              Forecast issue time
              <CalciteSelect
                value={issueDate || 'latest'}
                onCalciteSelectChange={(event) => {
                  const value = (event.target as HTMLCalciteSelectElement).value;
                  setIssueDate(value === 'latest' ? '' : value);
                }}
              >
                <option value="latest">Latest available</option>
                {forecast.availableDates.map((date) => (
                  <option key={date} value={date}>
                    {formatIssueDate(date)}
                  </option>
                ))}
              </CalciteSelect>
            </CalciteLabel>
          ) : null}
          {forecastLoading && <CalciteLoader inline label="Retrieving GEOGLOWS reach products" />}
          {forecastError && (
            <CalciteNotice open kind="danger" icon>
              <div slot="title">GEOGLOWS forecast unavailable</div>
              <div slot="message">{forecastError}</div>
            </CalciteNotice>
          )}
          {forecast && (
            <>
              <div className="my-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                {forecast.metadata.model} · {forecast.metadata.units} · issued{' '}
                {forecast.metadata.gen_date} · retrieved {forecast.metadata.retrievedAt}
              </div>
              <CalciteLabel>
                Forecast valid time
                <CalciteSlider
                  min={0}
                  max={Math.max(0, forecast.stats.datetime.length - 1)}
                  step={1}
                  value={forecastIndex}
                  disabled={forecast.stats.datetime.length < 2}
                  label="Select GEOGLOWS forecast time step"
                  onCalciteSliderInput={(event) =>
                    handleForecastTimeChange(
                      Number((event.target as HTMLCalciteSliderElement).value)
                    )
                  }
                />
              </CalciteLabel>
              <div className="mb-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
                {forecast.stats.datetime[forecastIndex] || 'No forecast timestamp'} · Map corridor
                synchronized to the selected time when provided by the Living Atlas service.
              </div>
              <ForecastHydrographChart
                forecast={forecast}
                ensembles={ensembles}
                showEnsembles={Boolean(ensembles)}
                showHighRes={false}
                showReturnPeriods={false}
              />
              {ensembleError && (
                <CalciteNotice open kind="warning" icon>
                  <div slot="title">Ensemble members unavailable</div>
                  <div slot="message">{ensembleError}</div>
                </CalciteNotice>
              )}
            </>
          )}
          {historicalError && (
            <CalciteNotice open kind="warning" icon>
              <div slot="title">Historical reference unavailable</div>
              <div slot="message">{historicalError}</div>
            </CalciteNotice>
          )}
          {historical && (
            <div className="mt-3 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
              Modelled historical streamflow, 2001–2025 monthly data: mean{' '}
              {historical.summary.meanM3s?.toFixed(2) ?? 'not available'} {historical.units};
              {' '}{historical.points.length} returned months. This is a model retrospective, not
              observed gauge data.
            </div>
          )}
          {!selectedReach && !forecastLoading && (
            <CalciteNotice open kind="info" icon>
              <div slot="title">Select a verified reach</div>
              <div slot="message">
                GEOGLOWS values are shown only for reaches with a verified local Tana network match.
              </div>
            </CalciteNotice>
          )}
          {forecast && geoglowsForecastTimeMs !== null && (
            <div className="mt-2 text-xs" style={{ color: 'var(--calcite-color-text-3)' }}>
              Map timestamp: {new Date(geoglowsForecastTimeMs).toISOString()} UTC
            </div>
          )}
        </div>
      </CalciteCard>

      <CalciteCard>
        <div slot="heading">Continue the analysis</div>
        <div className="flex flex-wrap gap-2 p-3">
          <CalciteButton
            appearance="outline"
            iconStart="layer-stream"
            onClick={() => onNavigateWorkspace('streamflow')}
          >
            Streamflow intelligence
          </CalciteButton>
          <CalciteButton
            appearance="outline"
            iconStart="rain"
            onClick={() => onNavigateWorkspace('catchment_response')}
          >
            Catchment response
          </CalciteButton>
          <CalciteButton
            appearance="outline"
            iconStart="user"
            onClick={() => onNavigateWorkspace('impact_exposure')}
          >
            Potential exposure
          </CalciteButton>
          <CalciteButton
            appearance="outline"
            iconStart="sliders-horizontal"
            onClick={() => onNavigateWorkspace('water_operations')}
          >
            Hypothetical operations
          </CalciteButton>
        </div>
      </CalciteCard>
    </div>
  );
}

function TerrainProfileChart({
  profile,
  onPointer,
  onPointerLeave,
}: {
  profile: RiverTerrainProfile;
  onPointer: (
    event: PointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>,
    activate?: boolean
  ) => void;
  onPointerLeave: () => void;
}) {
  const valid = profile.samples.filter(
    (sample) => sample.elevationMeters !== null && Number.isFinite(sample.elevationMeters)
  );
  if (valid.length < 2) {
    return (
      <CalciteNotice open kind="warning" icon>
        <div slot="title">Insufficient terrain samples</div>
        <div slot="message">
          The elevation service returned fewer than two valid samples; no profile is drawn.
        </div>
      </CalciteNotice>
    );
  }

  const width = 640;
  const height = 220;
  const left = 44;
  const right = 20;
  const top = 14;
  const bottom = 32;
  const minDistance = profile.samples[0].distanceMeters;
  const maxDistance = profile.samples[profile.samples.length - 1].distanceMeters;
  const elevations = valid.map((sample) => sample.elevationMeters as number);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationRange = Math.max(1, maxElevation - minElevation);
  const x = (distance: number) =>
    left + ((distance - minDistance) / Math.max(1, maxDistance - minDistance)) * (width - left - right);
  const y = (elevation: number) =>
    top + (1 - (elevation - minElevation) / elevationRange) * (height - top - bottom);
  const segments: string[][] = [];
  let currentSegment: string[] = [];
  for (const sample of profile.samples) {
    if (sample.elevationMeters === null) {
      if (currentSegment.length > 1) segments.push(currentSegment);
      currentSegment = [];
      continue;
    }
    currentSegment.push(
      `${x(sample.distanceMeters).toFixed(1)},${y(sample.elevationMeters).toFixed(1)}`
    );
  }
  if (currentSegment.length > 1) segments.push(currentSegment);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label="True ground elevation along connected river reaches"
      onPointerMove={onPointer}
      onPointerLeave={onPointerLeave}
      onClick={(event) => onPointer(event, true)}
    >
      {[0, 0.5, 1].map((fraction) => {
        const elevation = minElevation + fraction * elevationRange;
        const yValue = y(elevation);
        return (
          <g key={fraction}>
            <line
              x1={left}
              y1={yValue}
              x2={width - right}
              y2={yValue}
              stroke="var(--calcite-color-border-3)"
              strokeWidth="1"
            />
            <text
              x={left - 6}
              y={yValue + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--calcite-color-text-2)"
            >
              {Math.round(elevation)} m
            </text>
          </g>
        );
      })}
      {segments.map((points, index) => (
        <polyline
          key={index}
          points={points.join(' ')}
          fill="none"
          stroke="var(--calcite-color-brand)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      <text
        x={left}
        y={height - 8}
        fontSize="10"
        fill="var(--calcite-color-text-2)"
      >
        {formatDistance(minDistance)}
      </text>
      <text
        x={width - right}
        y={height - 8}
        textAnchor="end"
        fontSize="10"
        fill="var(--calcite-color-text-2)"
      >
        {formatDistance(maxDistance)} along route
      </text>
    </svg>
  );
}

function TerrainProfileSummary({
  profile,
  downstreamDirectionVerified,
}: {
  profile: RiverTerrainProfile;
  downstreamDirectionVerified: boolean;
}) {
  const valid = profile.samples.filter(
    (sample) => sample.elevationMeters !== null && Number.isFinite(sample.elevationMeters)
  );
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  const distanceKm = (last.distanceMeters - first.distanceMeters) / 1000;
  if (distanceKm <= 0) return null;
  const elevationChange = (last.elevationMeters as number) - (first.elevationMeters as number);
  const meanTerrainGradient = (elevationChange / distanceKm).toFixed(2);
  return (
    <div className="mt-2 text-xs" style={{ color: 'var(--calcite-color-text-2)' }}>
      {downstreamDirectionVerified
        ? 'Downstream terrain elevation change'
        : 'Terrain elevation change along source geometry'}
      : {elevationChange >= 0 ? '+' : ''}
      {Math.round(elevationChange)} m over {distanceKm.toFixed(2)} km · mean terrain-profile
      gradient {meanTerrainGradient} m/km
    </div>
  );
}
