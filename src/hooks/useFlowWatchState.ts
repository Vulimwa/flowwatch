import { useCallback, useEffect, useMemo, useState } from 'react';
import { DATA_REGISTRY, DATASET_BY_ID } from '../config/dataRegistry';
import {
  fetchBasinZonalStats,
  fetchEnsoStatus,
  fetchExposureScreening,
  fetchGeoglowsReachAnalysis,
  fetchTanaSubBasins,
} from '../services/analytics/analyticsClient';
import { discoverAllRegistryMetadata } from '../services/arcgis/discoveryService';
import {
  fetchGeoglowsMapServerMeta,
  fetchTanaGeoglowsReachIndex,
} from '../services/geoglows/geoglowsService';
import { renderGeoTiffLayer } from '../services/raster/rasterService';
import type {
  AppModuleId,
  BasinZonalStatsResponse,
  DamScenarioResult,
  DiscoveredServiceMetadata,
  EnsoStatusResponse,
  ExposureScreeningResult,
  GeoglowsMapServerMeta,
  GeoglowsReachIndexResponse,
  GeoglowsReachRecord,
  IdentifyResult,
  RasterRenderResult,
  RiverJourneyCameraTarget,
  RiverProfileMarker,
  ServiceStatus,
  StreamflowAnalysisResult,
  SubBasinPolygon,
  TanaReachMatch,
} from '../types/geospatial';

export interface LayerRuntimeState {
  visible: boolean;
  opacity: number;
  band: number;
  order: number;
  status: ServiceStatus;
  error?: string;
  render?: RasterRenderResult;
}

export function useFlowWatchState() {
  const [activeModule, setActiveModule] = useState<AppModuleId>('basin_situation');
  const [basemapId, setBasemapId] = useState<string>('topo-vector');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
  const [riverJourneyTarget, setRiverJourneyTarget] =
    useState<RiverJourneyCameraTarget | null>(null);
  const [riverProfileMarker, setRiverProfileMarker] = useState<RiverProfileMarker | null>(null);
  const [terrainExaggeration, setTerrainExaggeration] = useState<number>(2);
  const [mapLayersEnabled, setMapLayersEnabledState] = useState<boolean>(true);
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(false);
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(false);
  const [rightTab, setRightTab] = useState<'legend' | 'identify' | 'transparency'>('legend');
  const [darkTheme, setDarkTheme] = useState<boolean>(false);

  const [metadataById, setMetadataById] = useState<Record<string, DiscoveredServiceMetadata>>({});
  const [discoveryComplete, setDiscoveryComplete] = useState<boolean>(false);

  // HydroBASINS Level-7 Sub-Basins, Zonal Stats & Live NOAA ENSO
  const [subBasins, setSubBasins] = useState<SubBasinPolygon[]>([]);
  const [subBasinsLoading, setSubBasinsLoading] = useState(true);
  const [subBasinsError, setSubBasinsError] = useState<string | null>(null);
  const [selectedHybasId, setSelectedHybasId] = useState<number | 'all'>('all');
  const [zonalStats, setZonalStats] = useState<BasinZonalStatsResponse | null>(null);
  const [zonalLoading, setZonalLoading] = useState<boolean>(true);
  const [ensoStatus, setEnsoStatus] = useState<EnsoStatusResponse | null>(null);
  const [ensoLoading, setEnsoLoading] = useState<boolean>(true);

  // GEOGLOWS MapServer & Tana Reach Index state
  const [geoglowsMapMeta, setGeoglowsMapMeta] = useState<GeoglowsMapServerMeta | null>(null);
  const [geoglowsForecastTimeMs, setGeoglowsForecastTimeMs] = useState<number | null>(null);
  const [geoglowsIndex, setGeoglowsIndex] = useState<GeoglowsReachIndexResponse | null>(null);
  const [geoglowsIndexLoading, setGeoglowsIndexLoading] = useState<boolean>(true);
  const [geoglowsIndexError, setGeoglowsIndexError] = useState<string | null>(null);

  const [layersState, setLayersState] = useState<Record<string, LayerRuntimeState>>(() => {
    const initial: Record<string, LayerRuntimeState> = {};
    DATA_REGISTRY.forEach((ds, idx) => {
      initial[ds.id] = {
        visible: ds.visibleByDefault,
        opacity: ds.defaultOpacity,
        band: ds.defaultBand ?? 0,
        order: idx,
        status: 'idle',
      };
    });
    return initial;
  });

  const [selectedStreamFid, setSelectedStreamFid] = useState<number | null>(null);
  const [selectedLinkno, setSelectedLinkno] = useState<number | null>(null);
  const [selectedTanaMatch, setSelectedTanaMatch] = useState<TanaReachMatch | null>(null);
  const [geoglowsUnverifiedMsg, setGeoglowsUnverifiedMsg] = useState<string | null>(null);

  // Shared Streamflow Analysis, Exposure Screening & Operations Results (used across workspaces + report)
  const [streamflowAnalysis, setStreamflowAnalysis] = useState<StreamflowAnalysisResult | null>(null);
  const [exposureBufferMeters, setExposureBufferMeters] = useState<500 | 1000 | 2000 | 5000>(2000);
  const [exposureScreening, setExposureScreening] = useState<ExposureScreeningResult | null>(null);
  const [exposureLoading, setExposureLoading] = useState<boolean>(false);
  const [exposureError, setExposureError] = useState<string | null>(null);
  const [damResult, setDamResult] = useState<DamScenarioResult | null>(null);

  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [identifying, setIdentifying] = useState<boolean>(false);
  const [zoomTarget, setZoomTarget] = useState<{
    bbox?: [number, number, number, number];
    streamFid?: number;
    geoglowsLinkno?: number;
    hybasId?: number;
    coord?: [number, number];
    resetHome?: boolean;
    nonce: number;
  } | null>(null);

  const [infoModalDatasetId, setInfoModalDatasetId] = useState<string | null>(null);
  const [activeIndicatorId, setActiveIndicatorId] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState<boolean>(false);

  const loadGeoglowsInfrastructure = useCallback(async (refreshIndex = false) => {
    setGeoglowsIndexLoading(true);
    setGeoglowsIndexError(null);
    const [metaRes, idxRes] = await Promise.allSettled([
      fetchGeoglowsMapServerMeta(),
      fetchTanaGeoglowsReachIndex(refreshIndex),
    ]);
    if (metaRes.status === 'fulfilled') {
      setGeoglowsMapMeta(metaRes.value);
      if (metaRes.value.timeExtent) {
        setGeoglowsForecastTimeMs((prev) => prev ?? metaRes.value.timeExtent![0]);
      }
    }
    if (idxRes.status === 'fulfilled') {
      setGeoglowsIndex(idxRes.value);
      setGeoglowsIndexError(null);
    } else {
      setGeoglowsIndexError(
        idxRes.reason instanceof Error ? idxRes.reason.message : 'Failed to load GEOGLOWS reach index'
      );
    }
    setGeoglowsIndexLoading(false);
  }, []);

  useEffect(() => {
    void loadGeoglowsInfrastructure(false);
  }, [loadGeoglowsInfrastructure]);

  const loadSubBasins = useCallback(async (refresh = false, signal?: AbortSignal) => {
    setSubBasinsLoading(true);
    setSubBasinsError(null);
    try {
      const response = await fetchTanaSubBasins(refresh, signal);
      if (response.subBasins.length !== 5) {
        throw new Error(
          `The study-area service returned ${response.subBasins.length} of 5 expected sub-basins.`
        );
      }
      setSubBasins(response.subBasins);
    } catch (error) {
      if (signal?.aborted) return;
      setSubBasinsError(
        error instanceof Error ? error.message : 'Failed to load study-area sub-basins.'
      );
    } finally {
      if (!signal?.aborted) setSubBasinsLoading(false);
    }
  }, []);

  const reloadSubBasins = useCallback(() => {
    void loadSubBasins(true);
  }, [loadSubBasins]);

  // Load 5-sub-basin HydroBASINS L7 polygons, polygon-masked zonal stats & NOAA CPC ONI on mount
  useEffect(() => {
    const controller = new AbortController();
    void loadSubBasins(false, controller.signal);

    setZonalLoading(true);
    fetchBasinZonalStats(false, controller.signal)
      .then((res) => {
        setZonalStats(res);
        setZonalLoading(false);
      })
      .catch(() => setZonalLoading(false));

    setEnsoLoading(true);
    fetchEnsoStatus(controller.signal)
      .then((res) => {
        setEnsoStatus(res);
        setEnsoLoading(false);
      })
      .catch(() => setEnsoLoading(false));

    return () => controller.abort();
  }, [loadSubBasins]);

  // Discover all ArcGIS items, FeatureServer, & GEOGLOWS MapServer metadata on mount
  useEffect(() => {
    let cancelled = false;
    discoverAllRegistryMetadata((id, meta) => {
      if (cancelled) return;
      setMetadataById((prev) => ({ ...prev, [id]: meta }));
      setLayersState((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        if (meta.status === 'error') {
          return {
            ...prev,
            [id]: { ...cur, status: 'error', error: meta.errorMessage || 'Unavailable' },
          };
        }
        return {
          ...prev,
          [id]: {
            ...cur,
            status:
              cur.render || dsIsVectorOrMap(id) ? 'ready' : 'available',
          },
        };
      });
    }).then(() => {
      if (!cancelled) setDiscoveryComplete(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reachByLinkno = useMemo(() => {
    const map = new Map<number, GeoglowsReachRecord>();
    geoglowsIndex?.reaches.forEach((r) => map.set(r.linkno, r));
    return map;
  }, [geoglowsIndex]);

  const tanaMatchByFid = useMemo(() => {
    const map = new Map<number, TanaReachMatch>();
    geoglowsIndex?.tanaMatches.forEach((m) => map.set(m.tana_feature_id, m));
    return map;
  }, [geoglowsIndex]);

  // Automatically select verified mainstem Tana reach once index arrives if user hasn't picked one yet
  useEffect(() => {
    if (
      geoglowsIndex &&
      geoglowsIndex.reaches.some((reach) => reach.matchedFids.length > 0) &&
      selectedLinkno === null &&
      !geoglowsUnverifiedMsg
    ) {
      const preferred =
        geoglowsIndex.reaches.find(
          (r) =>
            r.matchedLocalNames.some((n) => /tana/i.test(n)) &&
            r.matchedFids.length > 0
        ) || geoglowsIndex.reaches.find((reach) => reach.matchedFids.length > 0);
      if (!preferred) return;
      setSelectedLinkno(preferred.linkno);
      if (preferred.matchedFids.length > 0) {
        const fid = preferred.matchedFids[0];
        setSelectedStreamFid(fid);
        setSelectedTanaMatch(tanaMatchByFid.get(fid) || null);
      }
    }
  }, [geoglowsIndex, selectedLinkno, geoglowsUnverifiedMsg, tanaMatchByFid]);

  // Keep latest StreamflowAnalysisResult synced for selectedLinkno (feeds Basin Situation + Impact & Report)
  useEffect(() => {
    if (selectedLinkno === null || geoglowsUnverifiedMsg) {
      setStreamflowAnalysis(null);
      return;
    }
    const controller = new AbortController();
    fetchGeoglowsReachAnalysis(selectedLinkno, null, controller.signal)
      .then((res) => setStreamflowAnalysis(res))
      .catch(() => {});
    return () => controller.abort();
  }, [selectedLinkno, geoglowsUnverifiedMsg]);

  const runExposureScreening = useCallback(
    async (linknoOverride?: number, bufferOverride?: 500 | 1000 | 2000 | 5000) => {
      const targetLinkno = linknoOverride ?? selectedLinkno;
      const targetBuffer = bufferOverride ?? exposureBufferMeters;
      if (targetLinkno === null) return;
      setExposureLoading(true);
      setExposureError(null);
      try {
        const res = await fetchExposureScreening(targetLinkno, targetBuffer);
        setExposureScreening(res);
        setExposureLoading(false);
      } catch (err) {
        setExposureError(err instanceof Error ? err.message : 'Corridor exposure screening failed');
        setExposureLoading(false);
      }
    },
    [selectedLinkno, exposureBufferMeters]
  );

  // Auto-run exposure screening when entering Impact & Exposure workspace or changing radius/reach
  useEffect(() => {
    if (activeModule !== 'impact_exposure' || selectedLinkno === null || geoglowsUnverifiedMsg) {
      return;
    }
    if (
      exposureScreening &&
      exposureScreening.linkno === selectedLinkno &&
      exposureScreening.bufferMeters === exposureBufferMeters
    ) {
      return;
    }
    const controller = new AbortController();
    setExposureLoading(true);
    setExposureError(null);
    fetchExposureScreening(selectedLinkno, exposureBufferMeters, controller.signal)
      .then((res) => {
        setExposureScreening(res);
        setExposureLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setExposureError(err instanceof Error ? err.message : 'Corridor exposure screening failed');
        setExposureLoading(false);
      });
    return () => controller.abort();
  }, [activeModule, selectedLinkno, exposureBufferMeters, geoglowsUnverifiedMsg, exposureScreening]);

  // Automatically load GeoTIFF raster pixels when a raster layer becomes visible or its band changes
  const loadRaster = useCallback(async (datasetId: string, band: number) => {
    const dataset = DATASET_BY_ID[datasetId];
    if (!dataset || dataset.layerClass !== 'MediaLayer-GeoTIFF') return;

    setLayersState((prev) => ({
      ...prev,
      [datasetId]: { ...prev[datasetId], status: 'loading', error: undefined },
    }));

    try {
      const rendered = await renderGeoTiffLayer(dataset, band);
      setLayersState((prev) => ({
        ...prev,
        [datasetId]: {
          ...prev[datasetId],
          status: 'ready',
          render: rendered,
          band: rendered.band,
          error: undefined,
        },
      }));
    } catch (err) {
      setLayersState((prev) => ({
        ...prev,
        [datasetId]: {
          ...prev[datasetId],
          status: 'error',
          error: err instanceof Error ? err.message : 'Raster load error',
        },
      }));
    }
  }, []);

  // Load default visible rasters on startup (only when map layers are enabled)
  useEffect(() => {
    if (!mapLayersEnabled) return;
    DATA_REGISTRY.forEach((ds) => {
      if (ds.visibleByDefault && ds.layerClass === 'MediaLayer-GeoTIFF') {
        void loadRaster(ds.id, ds.defaultBand ?? 0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRaster]);

  const setMapLayersEnabled = useCallback(
    (enabled: boolean) => {
      setMapLayersEnabledState(enabled);
      if (enabled) {
        DATA_REGISTRY.forEach((ds) => {
          const cur = layersState[ds.id];
          if (
            cur?.visible &&
            ds.layerClass === 'MediaLayer-GeoTIFF' &&
            (!cur.render || cur.render.band !== cur.band)
          ) {
            void loadRaster(ds.id, cur.band);
          }
        });
      }
    },
    [layersState, loadRaster]
  );

  const setLayerVisible = useCallback(
    (datasetId: string, visible: boolean) => {
      setLayersState((prev) => {
        const cur = prev[datasetId];
        if (!cur) return prev;
        if (
          mapLayersEnabled &&
          visible &&
          (!cur.render || cur.render.band !== cur.band) &&
          DATASET_BY_ID[datasetId]?.layerClass === 'MediaLayer-GeoTIFF'
        ) {
          void loadRaster(datasetId, cur.band);
        }
        return { ...prev, [datasetId]: { ...cur, visible } };
      });
    },
    [loadRaster, mapLayersEnabled]
  );

  const clearAllLayers = useCallback(() => {
    setLayersState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], visible: false };
      });
      return next;
    });
  }, []);

  const activateExclusiveModuleLayer = useCallback(
    (datasetId: string, band?: number) => {
      const target = DATASET_BY_ID[datasetId];
      if (!target) return;

      setLayersState((prev) => {
        const next = { ...prev };
        DATA_REGISTRY.forEach((ds) => {
          if (ds.layerClass === 'MediaLayer-GeoTIFF') {
            next[ds.id] = { ...next[ds.id], visible: ds.id === datasetId };
          }
        });
        const targetBand = band ?? next[datasetId]?.band ?? target.defaultBand ?? 0;
        next[datasetId] = {
          ...next[datasetId],
          visible: true,
          band: targetBand,
        };
        return next;
      });

      if (mapLayersEnabled && target.layerClass === 'MediaLayer-GeoTIFF') {
        const chosenBand = band ?? layersState[datasetId]?.band ?? target.defaultBand ?? 0;
        void loadRaster(datasetId, chosenBand);
      }
    },
    [layersState, loadRaster, mapLayersEnabled]
  );

  const setLayerOpacity = useCallback((datasetId: string, opacity: number) => {
    setLayersState((prev) => {
      const cur = prev[datasetId];
      if (!cur) return prev;
      return { ...prev, [datasetId]: { ...cur, opacity } };
    });
  }, []);

  const setLayerBand = useCallback(
    (datasetId: string, band: number) => {
      setLayersState((prev) => {
        const cur = prev[datasetId];
        if (!cur) return prev;
        return { ...prev, [datasetId]: { ...cur, band, visible: true } };
      });
      if (mapLayersEnabled) {
        void loadRaster(datasetId, band);
      }
    },
    [loadRaster, mapLayersEnabled]
  );

  const moveLayerOrder = useCallback((datasetId: string, direction: 'up' | 'down') => {
    setLayersState((prev) => {
      const ordered = [...DATA_REGISTRY].sort(
        (a, b) => (prev[a.id]?.order ?? 0) - (prev[b.id]?.order ?? 0)
      );
      const idx = ordered.findIndex((d) => d.id === datasetId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= ordered.length) return prev;

      const next = { ...prev };
      const aId = ordered[idx].id;
      const bId = ordered[swapIdx].id;
      const orderA = next[aId].order;
      next[aId] = { ...next[aId], order: next[bId].order };
      next[bId] = { ...next[bId], order: orderA };
      return next;
    });
  }, []);

  const selectHybasId = useCallback((id: number | 'all', zoom = false) => {
    setSelectedHybasId(id);
    if (zoom) {
      if (id === 'all') {
        setZoomTarget({ resetHome: true, nonce: Date.now() });
      } else {
        setZoomTarget({ hybasId: id, nonce: Date.now() });
      }
    }
  }, []);

  const zoomToLayer = useCallback(
    (datasetId: string) => {
      const meta = metadataById[datasetId];
      const renderBbox = layersState[datasetId]?.render?.bbox;
      const bbox = renderBbox || meta?.bbox || [36.55, -1.25, 38.65, 0.45];
      setZoomTarget({ bbox, nonce: Date.now() });
    },
    [layersState, metadataById]
  );

  const zoomToStreamFeature = useCallback((fid: number) => {
    setSelectedStreamFid(fid);
    setZoomTarget({ streamFid: fid, nonce: Date.now() });
  }, []);

  const zoomToGeoglowsReach = useCallback((linkno: number) => {
    setZoomTarget({ geoglowsLinkno: linkno, nonce: Date.now() });
  }, []);

  const zoomToCoord = useCallback((lon: number, lat: number) => {
    setZoomTarget({ coord: [lon, lat], nonce: Date.now() });
  }, []);

  const selectGeoglowsReach = useCallback(
    (linkno: number | null, zoom = false) => {
      if (linkno === null) {
        setSelectedLinkno(null);
        setSelectedTanaMatch(null);
        setGeoglowsUnverifiedMsg(null);
        return;
      }
      const reach = reachByLinkno.get(linkno);
    if (!reach || reach.matchedFids.length === 0) {
      setSelectedLinkno(null);
      setSelectedTanaMatch(null);
      setGeoglowsUnverifiedMsg(
        'This GEOGLOWS reach has no verified local Tana river match; reach-specific flow data are blocked.'
      );
      return;
    }
      setSelectedLinkno(linkno);
      setGeoglowsUnverifiedMsg(null);
      if (reach && reach.matchedFids.length > 0) {
        const fid = reach.matchedFids[0];
        setSelectedStreamFid(fid);
        setSelectedTanaMatch(tanaMatchByFid.get(fid) || null);
      } else {
        setSelectedTanaMatch(null);
      }
      if (zoom) {
        setZoomTarget({ geoglowsLinkno: linkno, nonce: Date.now() });
      }
    },
    [reachByLinkno, tanaMatchByFid]
  );

  const selectLocalStreamFid = useCallback(
    (fid: number | null, zoom = false) => {
      setSelectedStreamFid(fid);
      if (fid === null) return;
      const match = tanaMatchByFid.get(fid) || null;
      setSelectedTanaMatch(match);
      if (match) {
        if (match.verification_status === 'verified' && match.geoglows_linkno) {
          setSelectedLinkno(match.geoglows_linkno);
          setGeoglowsUnverifiedMsg(null);
        } else {
          setSelectedLinkno(null);
          setGeoglowsUnverifiedMsg('GEOGLOWS reach identifier not verified for this segment.');
        }
      }
      if (zoom) {
        setZoomTarget({ streamFid: fid, nonce: Date.now() });
      }
    },
    [tanaMatchByFid]
  );

  const applyIdentifyReachSelection = useCallback(
    (linkno: number | null, match: TanaReachMatch | null, verifyMessage: string | null) => {
      setSelectedTanaMatch(match);
      setGeoglowsUnverifiedMsg(verifyMessage);
      if (linkno !== null && !verifyMessage) {
        setSelectedLinkno(linkno);
      } else if (verifyMessage) {
        setSelectedLinkno(null);
      }
    },
    []
  );

  const resetHomeExtent = useCallback(() => {
    setZoomTarget({ resetHome: true, nonce: Date.now() });
  }, []);

  const visibleDatasets = useMemo(
    () =>
      DATA_REGISTRY.filter((d) => layersState[d.id]?.visible).sort(
        (a, b) => (layersState[b.id]?.order ?? 0) - (layersState[a.id]?.order ?? 0)
      ),
    [layersState]
  );

  const serviceStats = useMemo(() => {
    const vals = Object.values(metadataById);
    const available = vals.filter((m) => m.status === 'available').length;
    const errored = vals.filter((m) => m.status === 'error').length;
    return { total: DATA_REGISTRY.length, checked: vals.length, available, errored };
  }, [metadataById]);

  return {
    activeModule,
    setActiveModule,
    basemapId,
    setBasemapId,
    mapMode,
    setMapMode,
    riverJourneyTarget,
    setRiverJourneyTarget,
    riverProfileMarker,
    setRiverProfileMarker,
    terrainExaggeration,
    setTerrainExaggeration,
    mapLayersEnabled,
    setMapLayersEnabled,
    clearAllLayers,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    rightTab,
    setRightTab,
    darkTheme,
    setDarkTheme,
    metadataById,
    discoveryComplete,
    subBasins,
    subBasinsLoading,
    subBasinsError,
    reloadSubBasins,
    selectedHybasId,
    selectHybasId,
    zonalStats,
    zonalLoading,
    ensoStatus,
    ensoLoading,
    geoglowsMapMeta,
    geoglowsForecastTimeMs,
    setGeoglowsForecastTimeMs,
    geoglowsIndex,
    geoglowsIndexLoading,
    geoglowsIndexError,
    reloadGeoglowsInfrastructure: loadGeoglowsInfrastructure,
    reachByLinkno,
    tanaMatchByFid,
    layersState,
    setLayerVisible,
    activateExclusiveModuleLayer,
    setLayerOpacity,
    setLayerBand,
    moveLayerOrder,
    zoomToLayer,
    selectedStreamFid,
    setSelectedStreamFid,
    selectedLinkno,
    selectedTanaMatch,
    geoglowsUnverifiedMsg,
    selectGeoglowsReach,
    selectLocalStreamFid,
    applyIdentifyReachSelection,
    zoomToStreamFeature,
    zoomToGeoglowsReach,
    zoomToCoord,
    resetHomeExtent,
    zoomTarget,
    streamflowAnalysis,
    setStreamflowAnalysis,
    exposureBufferMeters,
    setExposureBufferMeters,
    exposureScreening,
    exposureLoading,
    exposureError,
    runExposureScreening,
    damResult,
    setDamResult,
    identifyResult,
    setIdentifyResult,
    identifying,
    setIdentifying,
    infoModalDatasetId,
    setInfoModalDatasetId,
    activeIndicatorId,
    setActiveIndicatorId,
    helpDialogOpen,
    setHelpDialogOpen,
    visibleDatasets,
    serviceStats,
  };
}

function dsIsVectorOrMap(id: string): boolean {
  const ds = DATASET_BY_ID[id];
  return ds?.nature === 'feature_service' || ds?.nature === 'map_service';
}
