export type AppModuleId =
  | 'basin_situation'
  | 'streamflow'
  | 'catchment_response'
  | 'impact_exposure'
  | 'water_operations';

export type SupportingToolId = 'layers' | 'registry' | 'indicators';

export type DatasetCategory =
  | 'Rainfall and Climate'
  | 'Soil Moisture and Evapotranspiration'
  | 'Rivers and Hydrology'
  | 'Terrain and Catchment'
  | 'Surface Water'
  | 'Land Cover and Built Environment'
  | 'Population and Exposure';

export type DatasetNature =
  | 'analytical_raster'
  | 'visualization_raster'
  | 'feature_service'
  | 'map_service';

export type ServiceStatus =
  | 'idle'
  | 'discovering'
  | 'available'
  | 'loading'
  | 'ready'
  | 'error';

export type ColorRampType =
  | 'precipitation'
  | 'anomaly_dry_wet'
  | 'soil_moisture'
  | 'temperature'
  | 'pet'
  | 'elevation'
  | 'slope'
  | 'flow_direction'
  | 'flow_accumulation'
  | 'hand'
  | 'stream_mask'
  | 'surface_water_occurrence'
  | 'surface_water_seasonality'
  | 'surface_water_transition'
  | 'land_cover'
  | 'population'
  | 'built_up'
  | 'rgb_visualization'
  | 'feature_streams'
  | 'geoglows_forecast';

export interface LegendSwatch {
  color: string;
  label: string;
  valueRange?: string;
}

export interface BandDefinition {
  index: number;
  code: string;
  label: string;
  periodNote?: string;
  units?: string;
  rampOverride?: ColorRampType;
}

export interface DatasetDefinition {
  id: string;
  itemId: string;
  title: string;
  shortTitle: string;
  category: DatasetCategory;
  moduleIds: AppModuleId[];
  nature: DatasetNature;
  companionId?: string;
  description: string;
  itemDataUrl: string;
  portalItemUrl: string;
  serviceUrl: string | null;
  layerClass: 'MediaLayer-GeoTIFF' | 'FeatureLayer' | 'MapImageLayer';
  visibleByDefault: boolean;
  defaultOpacity: number;
  defaultBand?: number;
  period: string;
  baseline?: string;
  isIncompletePeriod?: boolean;
  units: string;
  source: string;
  processingNotes: string;
  rampType: ColorRampType;
  bands?: BandDefinition[];
  categoricalSwatches?: LegendSwatch[];
}

export interface DiscoveredServiceMetadata {
  itemId: string;
  itemTitle: string | null;
  itemName: string | null;
  itemType: string | null;
  access: string | null;
  sizeBytes: number | null;
  dimensions: { width: number; height: number } | null;
  bandCount: number | null;
  bandNames: string[];
  overviews: number | null;
  bbox: [number, number, number, number] | null;
  pixelSizeDeg: [number, number] | null;
  approxResolutionLabel: string;
  pixelType: string | null;
  nodata: number | null;
  spatialReference: string | null;
  featureFields?: Array<{ name: string; type: string; alias: string }>;
  featureCount?: number | null;
  status: 'available' | 'error';
  errorMessage?: string;
  checkedAt: string;
}

export interface RasterStats {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  p05: number;
  p95: number;
  validCount: number;
  totalCount: number;
}

export interface RasterRenderResult {
  itemId: string;
  band: number;
  bandName: string;
  bandCount: number;
  bandNames: string[];
  bbox: [number, number, number, number];
  pngDataUrl: string;
  stats: RasterStats | null;
  nodata: number | null;
  isVisualization: boolean;
  width: number;
  height: number;
  nativeDimensions: { width: number; height: number };
  nativeResolutionDeg: [number, number];
  rampUsed: ColorRampType;
}

export interface RasterBandSummary {
  band: number;
  code: string;
  stats: RasterStats | null;
}

export interface RasterTimeSeriesResult {
  itemId: string;
  bandCount: number;
  bands: RasterBandSummary[];
}

export interface ProbeLayerValue {
  datasetId: string;
  title: string;
  nature: DatasetNature;
  band: number;
  bandName: string;
  value: number | null;
  formattedValue: string;
  units: string;
  allBands?: Array<{ name: string; value: number | null }>;
}

export interface StreamFeatureHit {
  fid: number;
  name: string;
  lengthMeters: number;
  attributes: Record<string, unknown>;
}

export interface GeoglowsMapLegendItem {
  label: string;
  imageData: string;
  contentType: string;
  values: string[];
}

export interface GeoglowsMapServerMeta {
  serviceUrl: string;
  layerId: number;
  layerName: string;
  capabilities: string;
  attribution: string;
  description: string;
  timeExtent: [number, number] | null;
  timeIntervalHours: number;
  maxRecordCount: number;
  fields: Array<{ name: string; type: string; alias: string }>;
  legend: GeoglowsMapLegendItem[];
  status: 'available' | 'error';
  errorMessage?: string;
  checkedAt: string;
}

export type MatchConfidence = 'high' | 'medium' | 'unverified';
export type VerificationStatus = 'verified' | 'unverified';

export interface GeoglowsReachRecord {
  linkno: number;
  outletLinkno: number | null;
  vpu: number | null;
  upstreamAreaKm2: number;
  geodesicLengthMeters: number;
  streamOrder: number;
  riverCountry: string;
  mapMeanFlowM3s: number | null;
  mapReturnPeriod: number | null;
  matchedLocalNames: string[];
  matchedFids: number[];
  displayName: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  paths: number[][][];
  damPosition: 'upstream_masinga' | 'seven_forks_cascade' | 'downstream_cascade' | 'tributary_or_outside';
}

export interface TanaReachMatch {
  tana_feature_id: number;
  tana_name: string | null;
  tana_length_m: number;
  geoglows_linkno: number | null;
  river_name: string | null;
  upstream_area_km2: number | null;
  stream_order: number | null;
  match_distance_m: number | null;
  max_distance_m: number | null;
  overlap_ratio: number;
  bearing_cos: number | null;
  match_confidence: MatchConfidence;
  match_method: string;
  identifier_source: string;
  verification_status: VerificationStatus;
  reason: string;
}

export interface GeoglowsReachIndexStats {
  aoiExtent: [number, number, number, number];
  geoglowsReachCount: number;
  tanaSegmentCount: number;
  verifiedHighCount: number;
  verifiedMediumCount: number;
  unverifiedCount: number;
  ambiguousCount: number;
  projectionUsed: string;
  sourceService: string;
  generatedAt: string;
}

export interface GeoglowsReachIndexResponse {
  stats: GeoglowsReachIndexStats;
  reaches: GeoglowsReachRecord[];
  tanaMatches: TanaReachMatch[];
}

export interface GeoglowsForecastBundle {
  linkno: number;
  issueDateRequested: string | null;
  availableDates: string[];
  metadata: {
    river_id: number;
    gen_date: string;
    start_date: string;
    end_date: string;
    units: string;
    timezone: 'UTC';
    model: string;
    retrievedAt: string;
  };
  stats: {
    datetime: string[];
    flow_min: Array<number | null>;
    flow_25p: Array<number | null>;
    flow_med: Array<number | null>;
    flow_avg: Array<number | null>;
    flow_75p: Array<number | null>;
    flow_max: Array<number | null>;
    high_res: Array<number | null>;
  };
  forecastSummary: {
    datetime: string[];
    flow_median: Array<number | null>;
    flow_uncertainty_lower: Array<number | null>;
    flow_uncertainty_upper: Array<number | null>;
  } | null;
  recentForecastRecords: {
    datetime: string[];
    average_flow: Array<number | null>;
  } | null;
  peakStats: {
    peakMeanM3s: number | null;
    peakMeanTime: string | null;
    peakMedianM3s: number | null;
    peakMedianTime: string | null;
    peakMaxEnsembleM3s: number | null;
    peakMaxEnsembleTime: string | null;
    initialFlowM3s: number | null;
  };
}

export interface GeoglowsEnsembleBundle {
  linkno: number;
  datetime: string[];
  members: Record<string, Array<number | null>>;
  memberNames: string[];
  retrievedAt: string;
}

export interface GeoglowsHistoricalResponse {
  linkno: number;
  mode: 'daily' | 'monthly' | 'annual' | 'monthly_climatology' | 'daily_climatology';
  label: string;
  sourceEndpoint: string;
  units: string;
  timezone: 'UTC';
  coverageNote: string;
  retrievedAt: string;
  points: Array<{
    date: string;
    flowM3s: number;
  }>;
  summary: {
    count: number;
    meanM3s: number | null;
    minM3s: number | null;
    minDate: string | null;
    maxM3s: number | null;
    maxDate: string | null;
  };
}

export interface GeoglowsReturnPeriodsResponse {
  linkno: number;
  units: string;
  method: string;
  source: string;
  restApiStatusNote: string | null;
  retrievedAt: string;
  thresholds: {
    rp2: number | null;
    rp5: number | null;
    rp10: number | null;
    rp25: number | null;
    rp50: number | null;
    rp100: number | null;
  };
  gumbelDaily: {
    rp2: number | null;
    rp5: number | null;
    rp10: number | null;
    rp25: number | null;
    rp50: number | null;
    rp100: number | null;
  } | null;
  maxSimulatedM3s: number | null;
}

export interface GeoglowsReachContextResponse {
  linkno: number;
  probeCoord: [number, number];
  spatialScopeNote: string;
  retrievedAt: string;
  climate: {
    chirpsYtd2026Mm: number | null;
    chirpsYtdBaselineMm: number | null;
    chirpsAnomMm: number | null;
    chirpsAnomPct: number | null;
    chirpsAnomZ: number | null;
    chirpsMam2026Mm: number | null;
    chirpsMamClimMm: number | null;
  };
  soil: {
    smRootZone2026: number | null;
    smRootZoneBaseline: number | null;
    smRootZoneAnom: number | null;
    smRootZoneZ: number | null;
    temp2026C: number | null;
    pet2026MmDay: number | null;
  };
  terrainAndWater: {
    elevationM: number | null;
    slopeDeg: number | null;
    handM: number | null;
    terrainUpaKm2: number | null;
    jrcWaterOccurrencePct: number | null;
    landCoverCode: number | null;
    landCoverLabel: string | null;
    population2025Cell: number | null;
    builtUp2020Pct: number | null;
  };
}

export interface IdentifyResult {
  longitude: number;
  latitude: number;
  elevationMeters?: number | null;
  streamHit: StreamFeatureHit | null;
  tanaMatch: TanaReachMatch | null;
  geoglowsReach: GeoglowsReachRecord | null;
  geoglowsVerifyMessage: string | null;
  rasterProbes: ProbeLayerValue[];
  timestamp: string;
}

export interface DamScenarioParams {
  id: string;
  name: string;
  initialStorageMcm: number;
  capacityMcm: number;
  deadStorageMcm: number;
  inflowM3s: number;
  proposedReleaseM3s: number;
  downstreamTributaryM3s: number;
  attenuationPct: number;
  evapLossMmDay: number;
  surfaceAreaKm2: number;
  days: number;
}

export interface DamMonthlyStep {
  monthIndex: number;
  label: string;
  startStorageMcm: number;
  inflowMcm: number;
  releaseMcm: number;
  evapMcm: number;
  spillMcm: number;
  endStorageMcm: number;
  downstreamFlowM3s: number;
  fillPct: number;
}

export interface DamScenarioResult {
  params: DamScenarioParams;
  inflowVolumeMcm: number;
  plannedReleaseMcm: number;
  actualReleaseMcm: number;
  evapLossMcm: number;
  spillMcm: number;
  remainingStorageMcm: number;
  storageDeltaMcm: number;
  fillPct: number;
  downstreamAtOutletM3s: number;
  deficitMcm: number;
  storageRiskStatus: 'Critical Low' | 'Watch Low' | 'Balanced' | 'High Spill Risk';
  downstreamStatus: 'Low Baseflow' | 'Moderate Flow' | 'Elevated Release' | 'High Spillway Surge';
  projection: DamMonthlyStep[];
}

// ---------------------------------------------------------------------------
// Analytical Engine Types (Sub-Basins, ENSO, Streamflow Analytics, Exposure)
// ---------------------------------------------------------------------------
export interface SubBasinPolygon {
  hybasId: number;
  pfafId: number;
  mainBas: number;
  nextDown: number;
  name: string;
  hydrologicRole: string;
  subAreaKm2: number;
  upAreaKm2: number;
  centroid: [number, number];
  bbox: [number, number, number, number];
  rings: number[][][];
  matchedReachCount: number;
  primaryRivers: string[];
  topReachLinkno: number | null;
}

export interface SubBasinsResponse {
  sourceService: string;
  geometryProvenance: string;
  totalSubAreaKm2: number;
  subBasins: SubBasinPolygon[];
  generatedAt: string;
}

export interface ZonalMetricSummary {
  mean: number | null;
  min: number | null;
  max: number | null;
  validPixelCount: number;
  resolutionNote: string;
}

export interface SubBasinZonalStats {
  hybasId: number | 'all';
  name: string;
  subAreaKm2: number;
  chirpsYtd2026Mm: ZonalMetricSummary;
  chirpsYtdBaselineMm: ZonalMetricSummary;
  chirpsAnomMm: ZonalMetricSummary;
  chirpsAnomPct: ZonalMetricSummary;
  chirpsAnomZ: ZonalMetricSummary;
  chirpsMam2026Mm: ZonalMetricSummary;
  chirpsMamClimMm: ZonalMetricSummary;
  chirpsMonthly2026Means: Array<number | null>;
  chirpsMonthlyClimMeans: Array<number | null>;
  era5SmRootZone2026: ZonalMetricSummary;
  era5SmRootZoneBaseline: ZonalMetricSummary;
  era5SmRootZoneAnom: ZonalMetricSummary;
  era5SmRootZoneZ: ZonalMetricSummary;
  era5Pet2026MmDay: ZonalMetricSummary;
  era5PetBaseMmDay: ZonalMetricSummary;
  era5Temp2026C: ZonalMetricSummary;
  demElevationM: ZonalMetricSummary;
  slopeDeg: ZonalMetricSummary;
  handM: ZonalMetricSummary;
}

export interface BasinZonalStatsResponse {
  retrievedAt: string;
  analysisWindow: string;
  baselinePeriod: string;
  basinWide: SubBasinZonalStats;
  bySubBasin: SubBasinZonalStats[];
}

export interface EnsoSeasonRecord {
  seasonCode: string;
  year: number;
  sstTotalC: number;
  oniAnomalyC: number;
  phase: 'El Niño' | 'La Niña' | 'Neutral';
}

export interface EnsoStatusResponse {
  sourceName: string;
  sourceUrl: string;
  thresholdDefinition: string;
  latestSeason: EnsoSeasonRecord | null;
  recentSeasons: EnsoSeasonRecord[];
  tanaSeasonCaveat: string;
  status: 'available' | 'error';
  errorMessage?: string;
  retrievedAt: string;
}

export type StreamflowSignalClass =
  | 'Potential high-flow concern'
  | 'Elevated forecast flow'
  | 'Near-normal modelled flow'
  | 'Below-normal modelled flow'
  | 'Potential low-flow concern'
  | 'Insufficient data';

export interface StreamflowAnalysisResult {
  linkno: number;
  issueDate: string;
  forecastMonth: number;
  historicalSampleSize: number;
  historicalPeriodLabel: string;
  historicalPercentiles: {
    p10: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
    matchedMonthMedian: number | null;
    matchedMonthMean: number | null;
  };
  forecastMetrics: {
    initialMedianM3s: number | null;
    peakMedianM3s: number | null;
    peakMeanM3s: number | null;
    peakMaxEnsembleM3s: number | null;
    peakHresM3s: number | null;
    peakMedianHistoricalPercentile: number | null;
    peakMedianVsMatchedMonthRatio: number | null;
    peakIqrWidthM3s: number | null;
    peakSpreadRatio: number | null;
    uncertaintyLevel: 'Low' | 'Moderate' | 'Substantial' | 'Unavailable';
    hresVsMedianDivergencePct: number | null;
  };
  exceedance: {
    highestExceededRpByMedian: string;
    highestExceededRpByMaxEnsemble: string;
    hoursAboveRp2Median: number;
    hoursAboveRp5Median: number;
    hoursAboveRp10Median: number;
    hoursAboveRp2MaxEnsemble: number;
    pctHorizonAboveRp2Median: number;
  };
  signalClass: StreamflowSignalClass;
  interpretationBullets: string[];
  limitations: string[];
  computedAt: string;
}

export type ConsistencyClassification =
  | 'Consistent'
  | 'Partially consistent'
  | 'Contradictory'
  | 'Insufficient for interpretation';

export interface CatchmentSignalConsistency {
  classification: ConsistencyClassification;
  summary: string;
  checks: Array<{
    indicator: string;
    signalDirection: 'wet / elevated' | 'dry / deficit' | 'neutral' | 'unavailable';
    observedValue: string;
    note: string;
  }>;
  explanation: string[];
}

export interface NearbyVectorFeature {
  id: number;
  name: string;
  category: string;
  distanceMeters: number;
  lon: number;
  lat: number;
  attributes: Record<string, unknown>;
}

export interface ExposureScreeningResult {
  linkno: number;
  reachName: string;
  bufferMeters: number;
  corridorAreaKm2Approx: number;
  retrievedAt: string;
  population2025: {
    estimatedTotal: number | null;
    validCells: number;
    cellCountInBuffer: number;
    resolutionNote: string;
    year: number;
    nodataTreatment: string;
    aggregationMethod: string;
    isEstimate: true;
  };
  builtUp2020: {
    meanBuiltUpPct: number | null;
    cellsWithBuiltUp: number;
    validCells: number;
    resolutionNote: string;
  };
  handTerrain: {
    medianHandM: number | null;
    meanHandM: number | null;
    pctUnder5m: number | null;
    pct5to15m: number | null;
    pctOver15m: number | null;
    meanElevationM: number | null;
    meanSlopeDeg: number | null;
    validCells: number;
    caveat: string;
  };
  landCover: {
    resolutionNote: string;
    classes: Array<{ code: number; label: string; pct: number }>;
  };
  surfaceWater: {
    meanOccurrencePct: number | null;
    maxOccurrencePct: number | null;
    meanSeasonalityMonths: number | null;
    caveat: string;
  };
  nearbySettlements: NearbyVectorFeature[];
  nearbyHealthFacilities: NearbyVectorFeature[];
  nearbySchoolsCount: number;
  nearbySchoolsSample: NearbyVectorFeature[];
  settlementsServiceStatus: 'available' | 'error';
  facilitiesServiceStatus: 'available' | 'error';
  priorityInvestigationNotes: string[];
  limitations: string[];
}

export interface IndicatorDefinition {
  id: string;
  name: string;
  workspace: AppModuleId;
  scientificDefinition: string;
  formulaOrMethod: string;
  inputDatasetIds: string[];
  units: string;
  temporalAggregation: string;
  spatialAggregation: string;
  validityRequirements: string;
  confidenceStatus: 'Verified' | 'Modelled / Conditional' | 'Screening Estimate' | 'Hypothetical';
  interpretationRules: string[];
  limitations: string[];
}

export interface SituationAssessmentReport {
  title: string;
  generatedAt: string;
  analysisWindow: string;
  selectedSubBasinName: string;
  selectedLinkno: number | null;
  selectedReachName: string;
  ensoContext: string;
  rainfallConditions: string;
  catchmentWetnessAndPet: string;
  streamflowConditions: string;
  forecastVsHistorical: string;
  returnPeriodInterpretation: string;
  signalConsistency: string;
  potentiallyExposedAreas: string;
  waterManagementConsiderations: string;
  uncertaintyAndLimitations: string[];
  dataSourcesAndMethodology: string[];
}
