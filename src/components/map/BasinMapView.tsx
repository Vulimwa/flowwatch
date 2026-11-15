import { useEffect, useRef, useState } from 'react';
import esriConfig from '@arcgis/core/config';
import EsriMap from '@arcgis/core/Map';
import Basemap from '@arcgis/core/Basemap';
import Camera from '@arcgis/core/Camera';
import Ground from '@arcgis/core/Ground';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import MediaLayer from '@arcgis/core/layers/MediaLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import BaseElevationLayer, { type FetchTileOptions } from '@arcgis/core/layers/BaseElevationLayer';
import ImageElement from '@arcgis/core/layers/support/ImageElement';
import ExtentAndRotationGeoreference from '@arcgis/core/layers/support/ExtentAndRotationGeoreference';
import TimeExtent from '@arcgis/core/time/TimeExtent';
import Extent from '@arcgis/core/geometry/Extent';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import {
  geodesicBufferExecute,
  geodesicBufferIsLoaded,
  geodesicBufferLoad,
} from '@arcgis/core/geometry/operators/geodesicBufferOperator';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import Graphic from '@arcgis/core/Graphic';
import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import Compass from '@arcgis/core/widgets/Compass';
import ScaleBar from '@arcgis/core/widgets/ScaleBar';
import Search from '@arcgis/core/widgets/Search';
import {
  CalciteAction,
  CalciteActionBar,
  CalciteActionGroup,
  CalciteButton,
  CalciteCard,
  CalciteChip,
  CalciteDropdown,
  CalciteDropdownGroup,
  CalciteDropdownItem,
  CalciteLoader,
  CalciteNotice,
  CalciteScrim,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem,
  CalciteSwitch,
} from '@esri/calcite-components-react';

import {
  DATA_REGISTRY,
  DATASET_BY_ID,
  GEOGLOWS_MAPSERVER_SERVICE_URL,
  KENYA_HEALTH_FACILITIES_SERVICE_URL,
  KENYA_PRIMARY_SCHOOLS_SERVICE_URL,
  KENYA_TOWNS_SERVICE_URL,
  TANA_STREAMS_SERVICE_URL,
} from '../../config/dataRegistry';
import {
  BASEMAP_OPTIONS,
  TANA_3D_CAMERA_PRESETS,
  TANA_BASIN_AOI_EXTENT,
  TANA_REFERENCE_LOCATIONS,
  TERRAIN_EXAGGERATION_OPTIONS,
  type CameraPreset3D,
} from '../../config/mapConfig';
import type { LayerRuntimeState } from '../../hooks/useFlowWatchState';
import { identifyGeoglowsReachAtPoint } from '../../services/geoglows/geoglowsService';
import { probeVisibleRasters } from '../../services/raster/rasterService';
import type {
  AppModuleId,
  ExposureScreeningResult,
  GeoglowsReachRecord,
  IdentifyResult,
  StreamFeatureHit,
  SubBasinPolygon,
  TanaReachMatch,
} from '../../types/geospatial';

esriConfig.assetsPath = '/arcgis-assets';

const WORLD_TERRAIN_3D_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

type ExaggeratedLayerInstance = BaseElevationLayer & {
  exaggeration: number;
  _elevation?: ElevationLayer;
};

const ExaggeratedElevationLayer = (
  BaseElevationLayer as unknown as {
    createSubclass: (def: Record<string, unknown>) => new (props?: {
      exaggeration?: number;
      title?: string;
    }) => ExaggeratedLayerInstance;
  }
).createSubclass({
  properties: {
    exaggeration: 2,
  },
  load(this: ExaggeratedLayerInstance) {
    this._elevation = new ElevationLayer({
      url: WORLD_TERRAIN_3D_URL,
    });
    this.addResolvingPromise(this._elevation.load());
    return Promise.resolve(this);
  },
  fetchTile(
    this: ExaggeratedLayerInstance,
    level: number,
    row: number,
    col: number,
    options?: FetchTileOptions
  ) {
    if (!this._elevation) {
      return Promise.reject(new Error('World Terrain3D elevation source not initialized'));
    }
    const factor = this.exaggeration ?? 2;
    return this._elevation.fetchTile(level, row, col, options).then((data) => {
      if (factor !== 1) {
        const src = data.values;
        const scaled = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) {
          scaled[i] = src[i] === data.noDataValue ? src[i] : src[i] * factor;
        }
        return {
          ...data,
          values: scaled,
        };
      }
      return data;
    });
  },
});

function createTerrainGround(exaggeration: number): Ground {
  const layer = new ExaggeratedElevationLayer({
    exaggeration,
    title: `ArcGIS World Terrain3D (${exaggeration}× Relief)`,
  });
  return new Ground({
    layers: [layer as unknown as ElevationLayer],
  });
}

interface BasinMapViewProps {
  activeModule: AppModuleId;
  basemapId: string;
  onBasemapChange: (id: string) => void;
  viewMode: '2d' | '3d';
  onViewModeChange: (mode: '2d' | '3d') => void;
  terrainExaggeration: number;
  onTerrainExaggerationChange: (factor: number) => void;
  mapLayersEnabled: boolean;
  onMapLayersEnabledChange: (enabled: boolean) => void;
  darkTheme: boolean;
  layersState: Record<string, LayerRuntimeState>;
  subBasins: SubBasinPolygon[];
  selectedHybasId: number | 'all';
  selectedStreamFid: number | null;
  selectedLinkno: number | null;
  reachByLinkno: Map<number, GeoglowsReachRecord>;
  tanaMatchByFid: Map<number, TanaReachMatch>;
  geoglowsForecastTimeMs: number | null;
  exposureBufferMeters: number;
  exposureScreening: ExposureScreeningResult | null;
  onSelectStreamFid: (fid: number | null) => void;
  onIdentifyReachSelection: (
    linkno: number | null,
    match: TanaReachMatch | null,
    verifyMessage: string | null
  ) => void;
  zoomTarget: {
    bbox?: [number, number, number, number];
    streamFid?: number;
    geoglowsLinkno?: number;
    hybasId?: number;
    coord?: [number, number];
    resetHome?: boolean;
    nonce: number;
  } | null;
  onResetHome: () => void;
  onIdentifyStart: () => void;
  onIdentifyComplete: (result: IdentifyResult) => void;
  onOpenIdentifyTab: () => void;
}

export function BasinMapView({
  activeModule,
  basemapId,
  onBasemapChange,
  viewMode,
  onViewModeChange,
  terrainExaggeration,
  onTerrainExaggerationChange,
  mapLayersEnabled,
  onMapLayersEnabledChange,
  darkTheme,
  layersState,
  subBasins,
  selectedHybasId,
  selectedStreamFid,
  selectedLinkno,
  reachByLinkno,
  tanaMatchByFid,
  geoglowsForecastTimeMs,
  exposureBufferMeters,
  exposureScreening,
  onSelectStreamFid,
  onIdentifyReachSelection,
  zoomTarget,
  onResetHome,
  onIdentifyStart,
  onIdentifyComplete,
  onOpenIdentifyTab,
}: BasinMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | SceneView | null>(null);
  const mapRef = useRef<EsriMap | null>(null);
  const mediaLayersRef = useRef<Map<string, MediaLayer>>(new Map());
  const subBasinLayerRef = useRef<GraphicsLayer | null>(null);
  const geoglowsLayerRef = useRef<MapImageLayer | null>(null);
  const geoglowsLoadInitiatedRef = useRef<boolean>(false);
  const streamsLayerRef = useRef<FeatureLayer | null>(null);
  const kenyaTownsLayerRef = useRef<FeatureLayer | null>(null);
  const kenyaHealthLayerRef = useRef<FeatureLayer | null>(null);
  const kenyaSchoolsLayerRef = useRef<FeatureLayer | null>(null);
  const highlightLayerRef = useRef<GraphicsLayer | null>(null);

  // Preserve spatial focus smoothly when switching between 2D MapView & 3D SceneView
  const preservedViewStateRef = useRef<{
    center: [number, number];
    scale: number;
  } | null>(null);

  const layersStateRef = useRef(layersState);
  layersStateRef.current = layersState;
  const mapLayersEnabledRef = useRef(mapLayersEnabled);
  mapLayersEnabledRef.current = mapLayersEnabled;
  const reachByLinknoRef = useRef(reachByLinkno);
  reachByLinknoRef.current = reachByLinkno;
  const tanaMatchByFidRef = useRef(tanaMatchByFid);
  tanaMatchByFidRef.current = tanaMatchByFid;
  const subBasinsRef = useRef(subBasins);
  subBasinsRef.current = subBasins;
  const basemapIdRef = useRef(basemapId);
  basemapIdRef.current = basemapId;
  const terrainExaggerationRef = useRef(terrainExaggeration);
  terrainExaggerationRef.current = terrainExaggeration;
  const darkThemeRef = useRef(darkTheme);
  darkThemeRef.current = darkTheme;
  const geoglowsForecastTimeRef = useRef(geoglowsForecastTimeMs);
  geoglowsForecastTimeRef.current = geoglowsForecastTimeMs;

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [geoglowsLayerError, setGeoglowsLayerError] = useState<string | null>(null);
  const [pointerCoords, setPointerCoords] = useState<{
    lon: number;
    lat: number;
    elevM: number | null;
  } | null>(null);
  const [cameraTelemetry, setCameraTelemetry] = useState<{
    tilt: number;
    heading: number;
  }>({ tilt: 56, heading: 332 });
  const [activePresetId, setActivePresetId] = useState<string>('basin_oblique');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchHostRef = useRef<HTMLDivElement | null>(null);
  const searchWidgetRef = useRef<Search | null>(null);

  // Initialize ArcGIS Map + MapView (2D) or SceneView (Real 3D Terrain)
  useEffect(() => {
    if (!containerRef.current) return;

    setMapReady(false);
    setMapError(null);
    setGeoglowsLayerError(null);

    const aoiExtent = new Extent({
      xmin: TANA_BASIN_AOI_EXTENT.xmin,
      ymin: TANA_BASIN_AOI_EXTENT.ymin,
      xmax: TANA_BASIN_AOI_EXTENT.xmax,
      ymax: TANA_BASIN_AOI_EXTENT.ymax,
      spatialReference: { wkid: 4326 },
    });

    const subBasinLayer = new GraphicsLayer({
      id: 'tana-subbasins-layer',
      title: 'Upper Tana HydroBASINS L7 Sub-Basins',
      listMode: 'hide',
      elevationInfo: { mode: 'on-the-ground' },
    });
    subBasinLayerRef.current = subBasinLayer;

    // Fallback outline while exact 5 HydroBASINS polygons load
    subBasinLayer.add(
      new Graphic({
        geometry: Polygon.fromExtent(aoiExtent),
        attributes: { kind: 'aoi-fallback' },
        symbol: new SimpleFillSymbol({
          color: [0, 122, 194, 0.0],
          outline: new SimpleLineSymbol({
            color: [0, 122, 194, 0.5],
            width: 1.2,
            style: 'dash',
          }),
        }),
      })
    );

    const highlightLayer = new GraphicsLayer({
      id: 'flowwatch-selection-highlight',
      title: 'Selection, Buffer & Probe Marker',
      listMode: 'hide',
      elevationInfo: { mode: 'on-the-ground' },
    });
    highlightLayerRef.current = highlightLayer;

    const geoglowsLayer = new MapImageLayer({
      id: 'geoglows_forecast',
      url: GEOGLOWS_MAPSERVER_SERVICE_URL,
      title: 'GEOGLOWS River Streamflow Forecast',
      visible: layersStateRef.current.geoglows_forecast?.visible ?? true,
      opacity: layersStateRef.current.geoglows_forecast?.opacity ?? 0.85,
      sublayers: [{ id: 0, visible: true }],
      useViewTime: true,
    });
    geoglowsLayerRef.current = geoglowsLayer;
    geoglowsLoadInitiatedRef.current = false;
    if (mapLayersEnabledRef.current) {
      geoglowsLoadInitiatedRef.current = true;
      geoglowsLayer.load().catch((err: unknown) => {
        setGeoglowsLayerError(
          err instanceof Error ? err.message : 'GEOGLOWS MapServer layer failed to load'
        );
      });
    }

    const streamsLayer = new FeatureLayer({
      id: 'tana_river_streams',
      url: `${TANA_STREAMS_SERVICE_URL}/0`,
      title: 'Tana River Network (Local Vector)',
      elevationInfo: { mode: 'on-the-ground' },
      minScale: 0,
      maxScale: 0,
      outFields: ['FID', 'NAME', 'Shape__Length'],
      renderer: new SimpleRenderer({
        symbol: new SimpleLineSymbol({
          color: [0, 122, 194, 0.88],
          width: viewMode === '3d' ? 1.8 : 1.4,
        }),
      }),
      popupEnabled: false,
    });
    streamsLayerRef.current = streamsLayer;

    const townsLayer = new FeatureLayer({
      id: 'kenya_towns',
      url: `${KENYA_TOWNS_SERVICE_URL}/0`,
      title: 'Kenya Towns & Settlements',
      elevationInfo: { mode: 'on-the-ground' },
      visible: layersStateRef.current.kenya_towns?.visible ?? false,
      opacity: layersStateRef.current.kenya_towns?.opacity ?? 0.95,
      minScale: 0,
      outFields: ['OBJECTID', 'TOWN_NAME', 'TOWN_TYPE'],
      renderer: new SimpleRenderer({
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          color: [245, 158, 11, 0.94],
          size: 7.5,
          outline: { color: [17, 24, 39, 0.88], width: 1.1 },
        }),
      }),
      popupEnabled: false,
    });
    kenyaTownsLayerRef.current = townsLayer;

    const healthLayer = new FeatureLayer({
      id: 'kenya_health_facilities',
      url: `${KENYA_HEALTH_FACILITIES_SERVICE_URL}/0`,
      title: 'Kenya Health Facilities 2026',
      elevationInfo: { mode: 'on-the-ground' },
      visible: layersStateRef.current.kenya_health_facilities?.visible ?? false,
      opacity: layersStateRef.current.kenya_health_facilities?.opacity ?? 0.95,
      minScale: 0,
      outFields: ['OBJECTID'],
      renderer: new SimpleRenderer({
        symbol: new SimpleMarkerSymbol({
          style: 'square',
          color: [220, 38, 38, 0.92],
          size: 6.5,
          outline: { color: [255, 255, 255, 0.92], width: 1 },
        }),
      }),
      popupEnabled: false,
    });
    kenyaHealthLayerRef.current = healthLayer;

    const schoolsLayer = new FeatureLayer({
      id: 'kenya_primary_schools',
      url: `${KENYA_PRIMARY_SCHOOLS_SERVICE_URL}/0`,
      title: 'Kenya Primary Schools',
      elevationInfo: { mode: 'on-the-ground' },
      visible: layersStateRef.current.kenya_primary_schools?.visible ?? false,
      opacity: layersStateRef.current.kenya_primary_schools?.opacity ?? 0.85,
      minScale: 1_200_000,
      outFields: ['OBJECTID'],
      renderer: new SimpleRenderer({
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          color: [13, 148, 136, 0.88],
          size: 4.8,
          outline: { color: [255, 255, 255, 0.85], width: 0.7 },
        }),
      }),
      popupEnabled: false,
    });
    kenyaSchoolsLayerRef.current = schoolsLayer;

    const initialLayers = mapLayersEnabledRef.current
      ? [
          subBasinLayer,
          geoglowsLayer,
          streamsLayer,
          townsLayer,
          healthLayer,
          schoolsLayer,
          highlightLayer,
        ]
      : [subBasinLayer, highlightLayer];

    const map = new EsriMap({
      basemap: basemapIdRef.current,
      ground: viewMode === '3d' ? createTerrainGround(terrainExaggerationRef.current) : undefined,
      layers: initialLayers,
    });
    mapRef.current = map;

    const initialPreset = TANA_3D_CAMERA_PRESETS[0];
    const preserved = preservedViewStateRef.current;

    const view: MapView | SceneView =
      viewMode === '3d'
        ? new SceneView({
            container: containerRef.current,
            map,
            qualityProfile: 'high',
            camera: preserved
              ? {
                  position: {
                    longitude: preserved.center[0],
                    latitude: preserved.center[1] - 0.85,
                    z: Math.max(12000, Math.min(220000, (preserved.scale || 1_400_000) * 0.085)),
                  },
                  heading: 334,
                  tilt: 56,
                }
              : {
                  position: {
                    longitude: initialPreset.position[0],
                    latitude: initialPreset.position[1],
                    z: initialPreset.position[2],
                  },
                  heading: initialPreset.heading,
                  tilt: initialPreset.tilt,
                },
            environment: {
              atmosphereEnabled: true,
              starsEnabled: darkThemeRef.current,
              lighting: {
                type: 'sun',
                date: new Date('2026-05-15T06:45:00Z'),
                directShadowsEnabled: false,
              },
            },
            ui: {
              components: [],
            },
          })
        : new MapView({
            container: containerRef.current,
            map,
            ...(preserved
              ? { center: preserved.center, scale: preserved.scale }
              : { extent: aoiExtent }),
            constraints: {
              minZoom: 6,
              maxZoom: 17,
            },
            ui: {
              components: [],
            },
          });

    viewRef.current = view;

    if (geoglowsForecastTimeRef.current !== null) {
      view.timeExtent = new TimeExtent({
        start: new Date(geoglowsForecastTimeRef.current),
        end: new Date(geoglowsForecastTimeRef.current + 3 * 3600 * 1000),
      });
    }

    if (view.type === '3d') {
      const compass = new Compass({ view });
      view.ui.add(compass, 'bottom-left');
    } else {
      const scaleBar = new ScaleBar({
        view,
        unit: 'metric',
        style: 'ruler',
      });
      view.ui.add(scaleBar, 'bottom-left');
    }

    let cameraWatchHandle: { remove: () => void } | null = null;

    view
      .when(() => {
        setMapReady(true);
        setMapError(null);
        if (view.type === '3d') {
          setCameraTelemetry({
            tilt: Math.round(view.camera.tilt ?? 56),
            heading: Math.round(view.camera.heading ?? 332),
          });
          cameraWatchHandle = reactiveUtils.watch(
            () => [view.camera?.tilt, view.camera?.heading],
            ([tilt, heading]) => {
              setCameraTelemetry({
                tilt: Math.round(Number(tilt ?? 0)),
                heading: Math.round(((Number(heading ?? 0) % 360) + 360) % 360),
              });
            }
          );
        }
      })
      .catch((err: unknown) => {
        setMapError(
          err instanceof Error
            ? err.message
            : viewMode === '3d'
            ? 'ArcGIS 3D SceneView initialization failed'
            : 'ArcGIS MapView initialization failed'
        );
      });

    const moveHandle = view.on('pointer-move', (evt) => {
      const pt = view.toMap({ x: evt.x, y: evt.y });
      if (pt && typeof pt.longitude === 'number' && typeof pt.latitude === 'number') {
        const rawZ = view.type === '3d' && typeof pt.z === 'number' && Number.isFinite(pt.z) ? pt.z : null;
        const trueElevM =
          rawZ !== null ? rawZ / Math.max(1, terrainExaggerationRef.current) : null;
        setPointerCoords({
          lon: pt.longitude,
          lat: pt.latitude,
          elevM: trueElevM,
        });
      }
    });

    const clickHandle = view.on('click', async (evt) => {
      const mapPt = evt.mapPoint;
      if (!mapPt || typeof mapPt.longitude !== 'number' || typeof mapPt.latitude !== 'number') {
        return;
      }
      const lon = mapPt.longitude;
      const lat = mapPt.latitude;
      const rawZ =
        view.type === '3d' && typeof mapPt.z === 'number' && Number.isFinite(mapPt.z)
          ? mapPt.z
          : null;
      const elevationMeters =
        rawZ !== null ? rawZ / Math.max(1, terrainExaggerationRef.current) : null;

      onIdentifyStart();
      onOpenIdentifyTab();

      // Update probe point graphic (draped on-the-ground in 3D via highlightLayer elevationInfo)
      highlightLayer.removeMany(
        highlightLayer.graphics.filter((g) => g.attributes?.kind === 'probe').toArray()
      );
      highlightLayer.add(
        new Graphic({
          geometry: new Point({ longitude: lon, latitude: lat, spatialReference: { wkid: 4326 } }),
          attributes: { kind: 'probe' },
          symbol: new SimpleMarkerSymbol({
            style: 'circle',
            color: [255, 192, 0, 0.95],
            size: 10,
            outline: { color: [0, 122, 194, 1], width: 2 },
          }),
        })
      );

      const currentState = layersStateRef.current;
      const visibleAnalytical = DATA_REGISTRY.filter(
        (d) => d.nature === 'analytical_raster' && currentState[d.id]?.visible
      );
      const fallbackCoreIds = [
        'chirps_anomaly_2026',
        'era5_sm_anomaly_2026',
        'era5_pet_2026',
        'dem',
        'hand',
        'land_cover',
        'worldpop_2025',
      ];
      // Even when map layers are turned off/unloaded, always compute real pixel probes
      const probeDatasets =
        mapLayersEnabledRef.current && visibleAnalytical.length > 0
          ? visibleAnalytical
          : visibleAnalytical.length > 0
          ? visibleAnalytical
          : fallbackCoreIds
              .map((id) => DATASET_BY_ID[id])
              .filter((d): d is NonNullable<typeof d> => Boolean(d));

      const activeRasters = probeDatasets.map((dataset) => ({
        dataset,
        activeBand: currentState[dataset.id]?.band ?? dataset.defaultBand ?? 0,
      }));

      const canHitTestStreams =
        mapLayersEnabledRef.current && map.layers.includes(streamsLayer);

      const [hitRes, geoglowsIdRes, rasterProbes] = await Promise.all([
        canHitTestStreams
          ? view.hitTest(evt, { include: [streamsLayer] }).catch(() => null)
          : Promise.resolve(null),
        identifyGeoglowsReachAtPoint(lon, lat).catch(() => ({
          reach: null,
          distanceMeters: null,
          apiNearestRiverId: null,
        })),
        probeVisibleRasters(activeRasters, lon, lat),
      ]);

      let streamHit: StreamFeatureHit | null = null;
      if (hitRes) {
        const graphicHit = hitRes.results.find(
          (r): r is Extract<(typeof hitRes.results)[number], { type: 'graphic' }> =>
            r.type === 'graphic' && r.layer === streamsLayer
        );
        if (graphicHit) {
          const attrs = graphicHit.graphic.attributes as Record<string, unknown>;
          const fid = Number(attrs.FID);
          const rawName = String(attrs.NAME || '').trim();
          streamHit = {
            fid,
            name: rawName || `Unnamed Tributary Reach #${fid}`,
            lengthMeters: Number(attrs.Shape__Length) || 0,
            attributes: attrs,
          };
          onSelectStreamFid(fid);
        }
      }

      let tanaMatch: TanaReachMatch | null = null;
      let geoglowsReach: GeoglowsReachRecord | null = null;
      let geoglowsVerifyMessage: string | null = null;

      if (streamHit) {
        tanaMatch = tanaMatchByFidRef.current.get(streamHit.fid) || null;
        if (tanaMatch) {
          if (tanaMatch.verification_status === 'verified' && tanaMatch.geoglows_linkno) {
            geoglowsReach = reachByLinknoRef.current.get(tanaMatch.geoglows_linkno) || null;
            onIdentifyReachSelection(tanaMatch.geoglows_linkno, tanaMatch, null);
          } else {
            geoglowsVerifyMessage = 'GEOGLOWS reach identifier not verified for this segment.';
            onIdentifyReachSelection(null, tanaMatch, geoglowsVerifyMessage);
          }
        } else if (geoglowsIdRes.reach) {
          geoglowsReach = geoglowsIdRes.reach;
          onIdentifyReachSelection(geoglowsReach.linkno, null, null);
        }
      } else if (geoglowsIdRes.reach) {
        geoglowsReach = geoglowsIdRes.reach;
        const matchedFid = geoglowsReach.matchedFids?.[0] ?? null;
        if (matchedFid !== null) {
          onSelectStreamFid(matchedFid);
          tanaMatch = tanaMatchByFidRef.current.get(matchedFid) || null;
        }
        onIdentifyReachSelection(geoglowsReach.linkno, tanaMatch, null);
      }

      onIdentifyComplete({
        longitude: lon,
        latitude: lat,
        elevationMeters,
        streamHit,
        tanaMatch,
        geoglowsReach,
        geoglowsVerifyMessage,
        rasterProbes,
        timestamp: new Date().toISOString(),
      });
    });

    return () => {
      // Save center/scale so switching 2D <-> 3D keeps user focus
      try {
        const c = view.center;
        if (c && typeof c.longitude === 'number' && typeof c.latitude === 'number') {
          preservedViewStateRef.current = {
            center: [c.longitude, c.latitude],
            scale: view.scale || 1_400_000,
          };
        }
      } catch {
        // ignore if view wasn't ready yet
      }

      cameraWatchHandle?.remove();
      moveHandle.remove();
      clickHandle.remove();
      searchWidgetRef.current?.destroy();
      searchWidgetRef.current = null;
      view.destroy();
      viewRef.current = null;
      mapRef.current = null;
      mediaLayersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Update Terrain3D Vertical Exaggeration live in 3D mode without tearing down SceneView
  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewMode !== '3d' || !mapReady) return;
    map.ground = createTerrainGround(terrainExaggeration);
  }, [terrainExaggeration, viewMode, mapReady]);

  // Sync SceneView dark theme stars & atmosphere
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.type !== '3d' || !mapReady) return;
    view.environment.starsEnabled = darkTheme;
  }, [darkTheme, viewMode, mapReady]);

  // Render exact 5 HydroBASINS Level-7 polygons with focus highlight
  useEffect(() => {
    const layer = subBasinLayerRef.current;
    if (!layer || !mapReady || subBasins.length === 0) return;

    layer.removeAll();
    subBasins.forEach((sb) => {
      const isFocused = selectedHybasId === sb.hybasId;
      layer.add(
        new Graphic({
          geometry: new Polygon({
            rings: sb.rings,
            spatialReference: { wkid: 4326 },
          }),
          attributes: { kind: 'subbasin', hybasId: sb.hybasId, name: sb.name },
          symbol: new SimpleFillSymbol({
            color: isFocused ? [0, 122, 194, 0.1] : [0, 122, 194, 0.01],
            outline: new SimpleLineSymbol({
              color: isFocused ? [0, 122, 194, 0.95] : [0, 122, 194, 0.56],
              width: isFocused ? 2.5 : 1.2,
              style: isFocused ? 'solid' : 'dash',
            }),
          }),
        })
      );
    });
  }, [subBasins, selectedHybasId, viewMode, mapReady]);

  // Mount Search widget inside toggleable Calcite card container
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !mapReady || !searchHostRef.current) return;
    if (!searchWidgetRef.current) {
      searchWidgetRef.current = new Search({
        view,
        container: searchHostRef.current,
        popupEnabled: false,
      });
    }
  }, [mapReady, searchOpen, viewMode]);

  // Sync Basemap changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.basemap = Basemap.fromId(basemapId) ?? (basemapId as unknown as Basemap);
    }
  }, [basemapId, viewMode]);

  // Sync MapView / SceneView TimeExtent for GEOGLOWS time-enabled MapImageLayer
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (geoglowsForecastTimeMs === null) {
      view.timeExtent = null as unknown as TimeExtent;
    } else {
      view.timeExtent = new TimeExtent({
        start: new Date(geoglowsForecastTimeMs),
        end: new Date(geoglowsForecastTimeMs + 3 * 3600 * 1000),
      });
    }
  }, [geoglowsForecastTimeMs, mapReady, viewMode]);

  // Sync GeoTIFF MediaLayers + Vector/MapServer Layers visibility, opacity, ordering, and master Load toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const geoglowsLayer = geoglowsLayerRef.current;
    const streamsLayer = streamsLayerRef.current;
    const townsLayer = kenyaTownsLayerRef.current;
    const healthLayer = kenyaHealthLayerRef.current;
    const schoolsLayer = kenyaSchoolsLayerRef.current;

    if (!mapLayersEnabled) {
      // Unload operational map overlays cleanly without touching any background/API computations
      mediaLayersRef.current.forEach((ml) => {
        if (map.layers.includes(ml)) {
          map.remove(ml);
        }
      });
      [geoglowsLayer, streamsLayer, townsLayer, healthLayer, schoolsLayer].forEach((layer) => {
        if (layer && map.layers.includes(layer)) {
          map.remove(layer);
        }
      });
      return;
    }

    if (geoglowsLayer && !geoglowsLoadInitiatedRef.current) {
      geoglowsLoadInitiatedRef.current = true;
      geoglowsLayer.load().catch((err: unknown) => {
        setGeoglowsLayerError(
          err instanceof Error ? err.message : 'GEOGLOWS MapServer layer failed to load'
        );
      });
    }

    [geoglowsLayer, streamsLayer, schoolsLayer, healthLayer, townsLayer].forEach((layer) => {
      if (layer && !map.layers.includes(layer)) {
        map.add(layer);
      }
    });

    const geoglowsState = layersState['geoglows_forecast'];
    if (geoglowsLayer && geoglowsState) {
      geoglowsLayer.visible = geoglowsState.visible;
      geoglowsLayer.opacity = geoglowsState.opacity;
    }

    const streamsState = layersState['tana_river_streams'];
    if (streamsLayer && streamsState) {
      streamsLayer.visible = streamsState.visible;
      streamsLayer.opacity = streamsState.opacity;
    }

    if (townsLayer && layersState['kenya_towns']) {
      townsLayer.visible = layersState['kenya_towns'].visible;
      townsLayer.opacity = layersState['kenya_towns'].opacity;
    }

    if (healthLayer && layersState['kenya_health_facilities']) {
      healthLayer.visible = layersState['kenya_health_facilities'].visible;
      healthLayer.opacity = layersState['kenya_health_facilities'].opacity;
    }

    if (schoolsLayer && layersState['kenya_primary_schools']) {
      schoolsLayer.visible = layersState['kenya_primary_schools'].visible;
      schoolsLayer.opacity = layersState['kenya_primary_schools'].opacity;
    }

    const orderedRasters = DATA_REGISTRY.filter(
      (d) => d.layerClass === 'MediaLayer-GeoTIFF'
    ).sort((a, b) => (layersState[a.id]?.order ?? 0) - (layersState[b.id]?.order ?? 0));

    orderedRasters.forEach((ds) => {
      const st = layersState[ds.id];
      if (!st) return;

      let ml = mediaLayersRef.current.get(ds.id);
      if (st.render && !ml) {
        const element = new ImageElement({
          image: st.render.pngDataUrl,
          georeference: new ExtentAndRotationGeoreference({
            extent: new Extent({
              xmin: st.render.bbox[0],
              ymin: st.render.bbox[1],
              xmax: st.render.bbox[2],
              ymax: st.render.bbox[3],
              spatialReference: { wkid: 4326 },
            }),
          }),
        });
        ml = new MediaLayer({
          id: ds.id,
          title: ds.shortTitle,
          source: element,
          visible: st.visible,
          opacity: st.opacity,
          fullExtent: new Extent({
            xmin: st.render.bbox[0],
            ymin: st.render.bbox[1],
            xmax: st.render.bbox[2],
            ymax: st.render.bbox[3],
            spatialReference: { wkid: 4326 },
          }),
        });
        mediaLayersRef.current.set(ds.id, ml);
        const geoglowsIdx = geoglowsLayer ? map.layers.indexOf(geoglowsLayer) : map.layers.length;
        map.add(ml, Math.max(1, geoglowsIdx));
      } else if (ml) {
        if (!map.layers.includes(ml)) {
          const geoglowsIdx = geoglowsLayer ? map.layers.indexOf(geoglowsLayer) : map.layers.length;
          map.add(ml, Math.max(1, geoglowsIdx));
        }
        ml.visible = st.visible;
        ml.opacity = st.opacity;
        if (st.render) {
          const currentImg = (
            ml.source as unknown as { elements?: { getItemAt: (i: number) => ImageElement } }
          )?.elements?.getItemAt?.(0);
          if (!currentImg || currentImg.image !== st.render.pngDataUrl) {
            ml.source = new ImageElement({
              image: st.render.pngDataUrl,
              georeference: new ExtentAndRotationGeoreference({
                extent: new Extent({
                  xmin: st.render.bbox[0],
                  ymin: st.render.bbox[1],
                  xmax: st.render.bbox[2],
                  ymax: st.render.bbox[3],
                  spatialReference: { wkid: 4326 },
                }),
              }),
            });
          }
        }
      }
    });

    orderedRasters.forEach((ds, idx) => {
      const ml = mediaLayersRef.current.get(ds.id);
      if (ml && map.layers.includes(ml)) {
        map.reorder(ml, idx + 1);
      }
    });
    const overlays = [
      geoglowsLayer,
      streamsLayer,
      schoolsLayer,
      healthLayer,
      townsLayer,
      highlightLayerRef.current,
    ].filter((l): l is NonNullable<typeof l> => Boolean(l) && map.layers.includes(l!));

    overlays.forEach((l, idx) => {
      map.reorder(l, map.layers.length - overlays.length + idx);
    });
  }, [layersState, mapLayersEnabled, viewMode, mapReady]);

  // Highlight selected local stream feature
  useEffect(() => {
    const streamsLayer = streamsLayerRef.current;
    const highlightLayer = highlightLayerRef.current;
    if (!streamsLayer || !highlightLayer || !mapReady) return;

    highlightLayer.removeMany(
      highlightLayer.graphics.filter((g) => g.attributes?.kind === 'stream').toArray()
    );

    if (selectedStreamFid === null) return;

    streamsLayer
      .queryFeatures({
        where: `FID = ${selectedStreamFid}`,
        returnGeometry: true,
        outFields: ['FID', 'NAME', 'Shape__Length'],
      })
      .then((res) => {
        if (!res.features.length) return;
        const feat = res.features[0];
        highlightLayer.add(
          new Graphic({
            geometry: feat.geometry,
            attributes: { kind: 'stream', fid: selectedStreamFid },
            symbol: new SimpleLineSymbol({
              color: [255, 192, 0, 1],
              width: 3.5,
            }),
          })
        );
      })
      .catch(() => {});
  }, [selectedStreamFid, viewMode, mapReady]);

  // Highlight selected verified GEOGLOWS reach geometry
  useEffect(() => {
    const highlightLayer = highlightLayerRef.current;
    if (!highlightLayer || !mapReady) return;

    highlightLayer.removeMany(
      highlightLayer.graphics.filter((g) => g.attributes?.kind === 'geoglows').toArray()
    );

    if (selectedLinkno === null) return;
    const reach = reachByLinkno.get(selectedLinkno);
    if (!reach || reach.paths.length === 0) return;

    const poly = new Polyline({
      paths: reach.paths,
      spatialReference: { wkid: 4326 },
    });

    highlightLayer.add(
      new Graphic({
        geometry: poly,
        attributes: { kind: 'geoglows', linkno: selectedLinkno },
        symbol: new SimpleLineSymbol({
          color: [6, 182, 212, 0.98],
          width: 5.5,
        }),
      })
    );
  }, [selectedLinkno, reachByLinkno, viewMode, mapReady]);

  // Render dashed corridor screening buffer ring & screened towns/facilities in Impact & Exposure workspace
  useEffect(() => {
    const highlightLayer = highlightLayerRef.current;
    if (!highlightLayer || !mapReady) return;

    let cancelled = false;
    highlightLayer.removeMany(
      highlightLayer.graphics
        .filter((g) => g.attributes?.kind === 'exposure-buffer' || g.attributes?.kind === 'exposure-feature')
        .toArray()
    );

    if (activeModule !== 'impact_exposure' || selectedLinkno === null) return;
    const reach = reachByLinkno.get(selectedLinkno);
    if (!reach || reach.paths.length === 0) return;

    const poly = new Polyline({
      paths: reach.paths,
      spatialReference: { wkid: 4326 },
    });

    const drawBuffer = async () => {
      if (!geodesicBufferIsLoaded()) {
        await geodesicBufferLoad();
      }
      if (cancelled) return;
      const buffered = geodesicBufferExecute(poly, exposureBufferMeters, { unit: 'meters' });
      if (buffered && !cancelled) {
        highlightLayer.add(
          new Graphic({
            geometry: buffered,
            attributes: { kind: 'exposure-buffer', linkno: selectedLinkno },
            symbol: new SimpleFillSymbol({
              color: [245, 158, 11, 0.09],
              outline: new SimpleLineSymbol({
                color: [217, 119, 6, 0.95],
                width: 2,
                style: 'dash',
              }),
            }),
          })
        );
      }
    };
    void drawBuffer().catch(() => {});

    if (exposureScreening && exposureScreening.linkno === selectedLinkno) {
      exposureScreening.nearbySettlements.slice(0, 40).forEach((s) => {
        highlightLayer.add(
          new Graphic({
            geometry: new Point({ longitude: s.lon, latitude: s.lat, spatialReference: { wkid: 4326 } }),
            attributes: { kind: 'exposure-feature', name: s.name },
            symbol: new SimpleMarkerSymbol({
              style: 'circle',
              color: [245, 158, 11, 0.95],
              size: 7.5,
              outline: { color: [17, 24, 39, 0.9], width: 1.2 },
            }),
          })
        );
      });
      exposureScreening.nearbyHealthFacilities.slice(0, 50).forEach((hf) => {
        highlightLayer.add(
          new Graphic({
            geometry: new Point({ longitude: hf.lon, latitude: hf.lat, spatialReference: { wkid: 4326 } }),
            attributes: { kind: 'exposure-feature', name: hf.name },
            symbol: new SimpleMarkerSymbol({
              style: 'square',
              color: [220, 38, 38, 0.95],
              size: 6.5,
              outline: { color: [255, 255, 255, 0.95], width: 1 },
            }),
          })
        );
      });
    }

    return () => {
      cancelled = true;
    };
  }, [activeModule, selectedLinkno, exposureBufferMeters, exposureScreening, reachByLinkno, viewMode, mapReady]);

  // Respond to Zoom-to-Layer, SubBasin, Coord, Stream, GEOGLOWS, or Reset Home AOI requests
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !zoomTarget) return;

    const go = (target: unknown) => {
      if (view.type === '3d') {
        view
          .goTo(
            target as Parameters<SceneView['goTo']>[0],
            { duration: 650, easing: 'cubic-in-out' }
          )
          .catch(() => {});
      } else {
        view
          .goTo(target as Parameters<MapView['goTo']>[0], { duration: 450 })
          .catch(() => {});
      }
    };

    if (zoomTarget.resetHome) {
      if (view.type === '3d') {
        const homeCam = TANA_3D_CAMERA_PRESETS[0];
        setActivePresetId(homeCam.id);
        go(
          new Camera({
            position: new Point({
              longitude: homeCam.position[0],
              latitude: homeCam.position[1],
              z: homeCam.position[2],
            }),
            heading: homeCam.heading,
            tilt: homeCam.tilt,
          })
        );
      } else {
        go(
          new Extent({
            xmin: TANA_BASIN_AOI_EXTENT.xmin,
            ymin: TANA_BASIN_AOI_EXTENT.ymin,
            xmax: TANA_BASIN_AOI_EXTENT.xmax,
            ymax: TANA_BASIN_AOI_EXTENT.ymax,
            spatialReference: { wkid: 4326 },
          })
        );
      }
      return;
    }

    if (zoomTarget.coord) {
      go(
        view.type === '3d'
          ? { target: new Point({ longitude: zoomTarget.coord[0], latitude: zoomTarget.coord[1] }), zoom: 13, tilt: 58 }
          : { center: zoomTarget.coord, zoom: 13 }
      );
      return;
    }

    if (zoomTarget.hybasId !== undefined) {
      const sb = subBasinsRef.current.find((s) => s.hybasId === zoomTarget.hybasId);
      if (sb) {
        const ext = new Extent({
          xmin: sb.bbox[0],
          ymin: sb.bbox[1],
          xmax: sb.bbox[2],
          ymax: sb.bbox[3],
          spatialReference: { wkid: 4326 },
        }).expand(1.15);
        go(view.type === '3d' ? { target: ext, tilt: 52 } : ext);
      }
      return;
    }

    if (zoomTarget.geoglowsLinkno !== undefined) {
      const reach = reachByLinkno.get(zoomTarget.geoglowsLinkno);
      if (reach && reach.paths.length > 0) {
        const poly = new Polyline({
          paths: reach.paths,
          spatialReference: { wkid: 4326 },
        });
        const targetGeom = poly.extent?.expand(1.6) || poly;
        go(view.type === '3d' ? { target: targetGeom, tilt: 56 } : targetGeom);
      }
      return;
    }

    if (zoomTarget.streamFid !== undefined && streamsLayerRef.current) {
      streamsLayerRef.current
        .queryFeatures({
          where: `FID = ${zoomTarget.streamFid}`,
          returnGeometry: true,
        })
        .then((res) => {
          if (res.features.length && res.features[0].geometry) {
            const targetGeom =
              res.features[0].geometry.extent?.expand(1.5) || res.features[0].geometry;
            go(view.type === '3d' ? { target: targetGeom, tilt: 55 } : targetGeom);
          }
        })
        .catch(() => {});
      return;
    }

    if (zoomTarget.bbox) {
      const [xmin, ymin, xmax, ymax] = zoomTarget.bbox;
      const ext = new Extent({
        xmin,
        ymin,
        xmax,
        ymax,
        spatialReference: { wkid: 4326 },
      });
      go(view.type === '3d' ? { target: ext, tilt: 52 } : ext);
    }
  }, [zoomTarget, reachByLinkno]);

  const handleZoomStep = (delta: number) => {
    const view = viewRef.current;
    if (!view) return;
    if (view.type === '3d') {
      view.goTo({ zoom: Math.max(4, Math.min(18, (view.zoom || 9) + delta)) }, { duration: 250 }).catch(() => {});
    } else {
      view.goTo({ zoom: view.zoom + delta }, { duration: 200 }).catch(() => {});
    }
  };

  const handleTiltToggle = () => {
    const view = viewRef.current;
    if (!view || view.type !== '3d' || !view.camera) return;
    const cam = view.camera.clone();
    cam.tilt = (cam.tilt ?? 0) > 20 ? 0 : 60;
    view
      .goTo(cam, { duration: 450, easing: 'cubic-in-out' })
      .catch(() => {});
  };

  const handleRotateStep = () => {
    const view = viewRef.current;
    if (!view || view.type !== '3d' || !view.camera) return;
    const cam = view.camera.clone();
    cam.heading = ((cam.heading ?? 0) + 45) % 360;
    view
      .goTo(cam, { duration: 400, easing: 'cubic-in-out' })
      .catch(() => {});
  };

  const handleFlyToPreset = (preset: CameraPreset3D) => {
    setActivePresetId(preset.id);
    const view = viewRef.current;
    if (!view) return;
    if (view.type === '3d') {
      view
        .goTo(
          new Camera({
            position: new Point({
              longitude: preset.position[0],
              latitude: preset.position[1],
              z: preset.position[2],
            }),
            heading: preset.heading,
            tilt: preset.tilt,
          }),
          { duration: 900, easing: 'cubic-in-out' }
        )
        .catch(() => {});
    } else {
      view.goTo({ center: [preset.position[0], preset.position[1]], zoom: 11 }, { duration: 450 }).catch(() => {});
    }
  };

  const handleFlyToLocation = (lon: number, lat: number) => {
    const view = viewRef.current;
    if (!view) return;
    if (view.type === '3d') {
      view
        .goTo(
          {
            target: new Point({ longitude: lon, latitude: lat }),
            zoom: 12,
            tilt: 60,
            heading: 340,
          },
          { duration: 750, easing: 'cubic-in-out' }
        )
        .catch(() => {});
    } else {
      view.goTo({ center: [lon, lat], zoom: 11 }, { duration: 450 }).catch(() => {});
    }
  };

  const loadingRasterCount = Object.values(layersState).filter(
    (s) => s.visible && s.status === 'loading'
  ).length;

  const activeLayerLabels = DATA_REGISTRY.filter((d) => layersState[d.id]?.visible).map((d) => {
    const st = layersState[d.id];
    const bandLabel = d.bands?.[st.band]?.label;
    return bandLabel ? `${d.shortTitle} (${bandLabel})` : d.shortTitle;
  });

  const activeExagOption =
    TERRAIN_EXAGGERATION_OPTIONS.find((o) => o.value === terrainExaggeration) ||
    TERRAIN_EXAGGERATION_OPTIONS[2];

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--calcite-color-background)' }}
    >
      <div
        ref={containerRef}
        className="w-full h-full flex-1"
        aria-label={
          viewMode === '3d'
            ? 'Interactive 3D Terrain Scene of Upper Tana River Basin'
            : 'Interactive 2D Map of Upper Tana River Basin'
        }
      />

      {/* Top-Left Floating Calcite Map & 3D Scene Toolbar */}
      <div
        className="flowwatch-map-toolbar absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-5.5rem)]"
        role="toolbar"
        aria-label="Map display and navigation tools"
      >
        <CalciteSegmentedControl
          scale="s"
          layout="horizontal"
          onCalciteSegmentedControlChange={(e) => {
            const next = (e.target as HTMLCalciteSegmentedControlElement).value as '2d' | '3d';
            if (next === '2d' || next === '3d') onViewModeChange(next);
          }}
        >
          <CalciteSegmentedControlItem value="2d" iconStart="map" checked={viewMode === '2d'}>
            2D Map
          </CalciteSegmentedControlItem>
          <CalciteSegmentedControlItem value="3d" iconStart="globe" checked={viewMode === '3d'}>
            3D Terrain
          </CalciteSegmentedControlItem>
        </CalciteSegmentedControl>

        <div
          className="flex items-center gap-1.5 px-2 rounded border shadow-sm"
          style={{
            backgroundColor: 'var(--calcite-color-foreground-1)',
            borderColor: 'var(--calcite-color-border-2)',
            height: '28px',
          }}
          title="Toggle loading heavy raster/vector overlays onto the map. All GEOGLOWS, zonal, exposure, dam, and click-probe computations continue running even when off."
        >
          <CalciteSwitch
            scale="s"
            checked={mapLayersEnabled}
            label="Load map layers"
            onCalciteSwitchChange={(e) => {
              onMapLayersEnabledChange(Boolean((e.target as HTMLCalciteSwitchElement).checked));
            }}
          />
          <button
            type="button"
            className="text-xs font-medium bg-transparent border-0 p-0 cursor-pointer"
            style={{ color: 'var(--calcite-color-text-1)' }}
            onClick={() => onMapLayersEnabledChange(!mapLayersEnabled)}
          >
            {mapLayersEnabled ? 'Layers On' : 'Compute Only'}
          </button>
        </div>

        <CalciteButton
          scale="s"
          kind="neutral"
          appearance="solid"
          iconStart="home"
          label={viewMode === '3d' ? 'Reset 3D Oblique Basin Camera' : 'Zoom to Tana Basin AOI'}
          onClick={onResetHome}
        >
          Basin Extent
        </CalciteButton>

        <CalciteDropdown>
          <CalciteButton
            slot="trigger"
            scale="m"
            kind="neutral"
            appearance="solid"
            iconStart="basemap"
            label={`Choose basemap. Current basemap: ${
              BASEMAP_OPTIONS.find((b) => b.id === basemapId)?.label || 'Unknown'
            }`}
          >
          </CalciteButton>
          <CalciteDropdownGroup groupTitle="Basemap Reference" selectionMode="single">
            {BASEMAP_OPTIONS.map((bm) => (
              <CalciteDropdownItem
                key={bm.id}
                selected={bm.id === basemapId}
                onCalciteDropdownItemSelect={() => onBasemapChange(bm.id)}
              >
                {bm.label}
              </CalciteDropdownItem>
            ))}
          </CalciteDropdownGroup>
        </CalciteDropdown>

        <CalciteDropdown>
          <CalciteButton
            slot="trigger"
            scale="s"
            kind="neutral"
            appearance="solid"
            iconStart={viewMode === '3d' ? 'camera' : 'pin'}
            iconEnd="chevron-down"
          >
            {viewMode === '3d' ? '3D Flyovers' : 'Locations'}
          </CalciteButton>
          {viewMode === '3d' && (
            <CalciteDropdownGroup groupTitle="3D Oblique Basin Viewpoints" selectionMode="single">
              {TANA_3D_CAMERA_PRESETS.map((preset) => (
                <CalciteDropdownItem
                  key={preset.id}
                  selected={preset.id === activePresetId}
                  onCalciteDropdownItemSelect={() => handleFlyToPreset(preset)}
                >
                  {preset.label}
                </CalciteDropdownItem>
              ))}
            </CalciteDropdownGroup>
          )}
          <CalciteDropdownGroup groupTitle="Tana Basin Hydrological Reaches">
            {TANA_REFERENCE_LOCATIONS.map((loc) => (
              <CalciteDropdownItem
                key={loc.name}
                onCalciteDropdownItemSelect={() => handleFlyToLocation(loc.lon, loc.lat)}
              >
                {loc.name}
              </CalciteDropdownItem>
            ))}
          </CalciteDropdownGroup>
        </CalciteDropdown>

        {viewMode === '3d' && (
          <CalciteDropdown>
            <CalciteButton
              slot="trigger"
              scale="s"
              kind="neutral"
              appearance="solid"
              iconStart="altitude"
              iconEnd="chevron-down"
            >
              Relief {activeExagOption.shortLabel}
            </CalciteButton>
            <CalciteDropdownGroup groupTitle="Terrain3D Vertical Exaggeration" selectionMode="single">
              {TERRAIN_EXAGGERATION_OPTIONS.map((opt) => (
                <CalciteDropdownItem
                  key={opt.value}
                  selected={terrainExaggeration === opt.value}
                  onCalciteDropdownItemSelect={() => onTerrainExaggerationChange(opt.value)}
                >
                  {opt.label}
                </CalciteDropdownItem>
              ))}
            </CalciteDropdownGroup>
          </CalciteDropdown>
        )}

        <CalciteButton
          scale="s"
          kind={searchOpen ? 'brand' : 'neutral'}
          appearance="solid"
          iconStart="search"
          onClick={() => setSearchOpen((v) => !v)}
        >
          Search
        </CalciteButton>

        {selectedLinkno !== null && (
          <CalciteChip
            scale="s"
            kind="brand"
            appearance="solid"
            icon="layer-stream"
            label={`Active GEOGLOWS LINKNO ${selectedLinkno}`}
          >
            LINKNO {selectedLinkno}
          </CalciteChip>
        )}
      </div>

      {searchOpen && (
        <div className="absolute top-12 left-3 z-20">
          <CalciteCard scale="s">
            <div ref={searchHostRef} />
          </CalciteCard>
        </div>
      )}

      {/* Top-Right Calcite Navigation ActionBar (with 3D Tilt & Rotate) */}
      <div className="absolute top-3 right-3 z-10">
        <CalciteActionBar
          className="flowwatch-map-actionbar"
          floating
          expandToggleDisabled
          layout="vertical"
          scale="m"
        >
          <CalciteActionGroup>
            <CalciteAction
              icon="plus"
              text="Zoom in"
              scale="s"
              onClick={() => handleZoomStep(1)}
            />
            <CalciteAction
              icon="minus"
              text="Zoom out"
              scale="s"
              onClick={() => handleZoomStep(-1)}
            />
            <CalciteAction
              icon="home"
              text={viewMode === '3d' ? 'Reset 3D basin camera' : 'Reset basin extent'}
              scale="s"
              onClick={onResetHome}
            />
          </CalciteActionGroup>

          {viewMode === '3d' && (
            <CalciteActionGroup>
              <CalciteAction
                icon="3d"
                text={cameraTelemetry.tilt > 20 ? 'Switch to top-down pitch (0°)' : 'Tilt oblique 3D (60°)'}
                scale="s"
                active={cameraTelemetry.tilt > 20}
                onClick={handleTiltToggle}
              />
              <CalciteAction
                icon="rotate"
                text="Rotate heading +45°"
                scale="s"
                onClick={handleRotateStep}
              />
            </CalciteActionGroup>
          )}
        </CalciteActionBar>
      </div>

      {loadingRasterCount > 0 && (
        <div className="absolute bottom-11 left-3 z-10">
          <CalciteChip scale="s" kind="brand" appearance="solid" label="Rendering GeoTIFF layers">
            <span className="inline-flex items-center gap-2">
              <CalciteLoader inline scale="s" label="Loading GeoTIFF layer" />
              <span>
                Draping {loadingRasterCount} GeoTIFF layer{loadingRasterCount > 1 ? 's' : ''}...
              </span>
            </span>
          </CalciteChip>
        </div>
      )}

      {geoglowsLayerError && (
        <div className="absolute top-14 right-14 z-20 max-w-xs">
          <CalciteNotice open closable kind="warning" scale="s" icon="exclamation-mark-triangle">
            <div slot="title">GEOGLOWS MapServer Overlay Issue</div>
            <div slot="message">{geoglowsLayerError}</div>
          </CalciteNotice>
        </div>
      )}

      {/* Bottom-Right Live Coordinate, Terrain3D Elevation & Camera Telemetry */}
      <div className="hidden sm:block absolute bottom-3 right-3 z-10 max-w-xl">
        <CalciteCard scale="s">
          <div
            className="flex items-center gap-2 text-xs tabular-nums flex-wrap"
            style={{
              fontFamily: 'var(--calcite-code-family)',
              color: 'var(--calcite-color-text-2)',
            }}
          >
            <span>
              {pointerCoords
                ? `${pointerCoords.lat.toFixed(4)}°, ${pointerCoords.lon.toFixed(4)}°`
                : 'Click terrain to inspect'}
            </span>
            {viewMode === '3d' && pointerCoords?.elevM != null && (
              <>
                <span aria-hidden="true">·</span>
                <span style={{ color: 'var(--calcite-color-text-1)' }}>
                  Elev {Math.round(pointerCoords.elevM).toLocaleString()} m
                </span>
              </>
            )}
            {viewMode === '3d' && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Tilt {cameraTelemetry.tilt}° / Hdg {cameraTelemetry.heading}°
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="max-w-[210px] truncate">
              {!mapLayersEnabled
                ? 'Layers unloaded (Compute-only)'
                : activeLayerLabels.length > 0
                ? activeLayerLabels.join(', ')
                : 'No thematic layers'}
            </span>
          </div>
        </CalciteCard>
      </div>

      {mapError && (
        <div className="absolute inset-x-4 bottom-12 z-20">
          <CalciteNotice open kind="danger" icon="exclamation-mark-triangle">
            <div slot="title">{viewMode === '3d' ? '3D Scene View Error' : 'Map View Error'}</div>
            <div slot="message">{mapError}</div>
            {viewMode === '3d' && (
              <CalciteButton
                slot="actions-end"
                scale="s"
                kind="inverse"
                onClick={() => onViewModeChange('2d')}
              >
                Switch to 2D Map
              </CalciteButton>
            )}
          </CalciteNotice>
        </div>
      )}

      {!mapReady && !mapError && <CalciteScrim loading />}

      <span className="hidden" data-total-registry={Object.keys(DATASET_BY_ID).length} />
    </div>
  );
}
