import type { ColorRampType, LegendSwatch } from '../types/geospatial';

export const RAMP_GRADIENTS: Record<
  ColorRampType,
  { label: string; stops: string[]; description: string }
> = {
  precipitation: {
    label: 'Sequential Precipitation (Low to High)',
    stops: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
    description: 'Light sky to deep hydro navy representing increasing rainfall accumulation.',
  },
  anomaly_dry_wet: {
    label: 'Diverging Dry-to-Wet Anomaly',
    stops: ['#8c510a', '#d8b365', '#f5f5f5', '#5ab4ac', '#01665e'],
    description: 'Amber-brown (below baseline) through neutral white-grey to deep teal (above baseline).',
  },
  soil_moisture: {
    label: 'Sequential Volumetric Soil Moisture',
    stops: ['#f6e8c3', '#c7eae5', '#5ab4ac', '#2166ac', '#053061'],
    description: 'Dry ochre to saturated blue-teal.',
  },
  temperature: {
    label: 'Sequential Air Temperature (2m)',
    stops: ['#3288bd', '#abdda4', '#fee08b', '#f46d43', '#9e0142'],
    description: 'Cool highland blue-green to warm semi-arid amber-crimson.',
  },
  pet: {
    label: 'Potential Evapotranspiration Demand',
    stops: ['#edf8b1', '#7fcdbb', '#fecc5c', '#fd8d3c', '#bd0026'],
    description: 'Low atmospheric moisture demand to high evaporative demand.',
  },
  elevation: {
    label: 'Hypsometric Terrain Elevation',
    stops: ['#2c7bb6', '#74add1', '#abd9e9', '#fee090', '#d73027', '#7f2704'],
    description: 'Lowland Tana plains to Mount Kenya / Aberdare headwaters.',
  },
  slope: {
    label: 'Terrain Slope Steepness',
    stops: ['#f7f7f7', '#d9f0a3', '#addd8e', '#fe9929', '#cc4c02', '#662506'],
    description: 'Gentle alluvial valleys to steep headwater escarpments.',
  },
  flow_direction: {
    label: 'D8 Flow Direction (8 Cardinal/Diagonal Aspects)',
    stops: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'],
    description: 'Categorical ESRI D8 steepest-descent flow direction codes.',
  },
  flow_accumulation: {
    label: 'Terrain Upstream Contributing Area (Log Scale)',
    stops: ['#f0f4f8', '#9ecae1', '#4292c6', '#08519c', '#081d58'],
    description: 'Log-scaled terrain-derived contributing area (not measured discharge).',
  },
  hand: {
    label: 'Height Above Nearest Drainage (HAND)',
    stops: ['#08306b', '#2171b5', '#6baed6', '#fed976', '#fd8d3c', '#f0f0f0'],
    description: 'Low relative elevation near channels (blue) to elevated ridges (warm/neutral).',
  },
  stream_mask: {
    label: 'Derived Stream Channels (UPA >= 100 km²)',
    stops: ['var(--calcite-color-brand)'],
    description: 'Terrain-derived drainage network thresholded at 100 km² upstream area.',
  },
  surface_water_occurrence: {
    label: 'JRC Surface Water Occurrence (0–100%)',
    stops: ['#f7fbff', '#9ecae1', '#3182bd', '#08519c'],
    description: 'Frequency of open surface water presence over satellite observation record.',
  },
  surface_water_seasonality: {
    label: 'JRC Surface Water Seasonality (1–12 Months)',
    stops: ['#deebf7', '#9ecae1', '#4292c6', '#084594'],
    description: 'Number of months per year surface water is present.',
  },
  surface_water_transition: {
    label: 'JRC Surface Water Transition Classes',
    stops: ['#1d4ed8', '#22c55e', '#dc2626', '#60a5fa', '#f59e0b'],
    description: 'Categorical water persistence, seasonal, and change classes.',
  },
  land_cover: {
    label: 'ESA WorldCover Land Cover Classes',
    stops: ['#006400', '#ffbb22', '#ffff4c', '#f096ff', '#fa0000', '#0064c8'],
    description: 'Categorical land cover classification.',
  },
  population: {
    label: 'Population Density (Log-Scaled)',
    stops: ['#fcfbfd', '#dadaeb', '#9e9ac8', '#6a51a3', '#3f007d'],
    description: 'Log-scaled population distribution per grid cell.',
  },
  built_up: {
    label: 'Built-Up Surface Fraction (%)',
    stops: ['#f7f7f7', '#fdbb84', '#ef6548', '#b30000'],
    description: 'Percentage of cell occupied by built-up structures.',
  },
  rgb_visualization: {
    label: 'Pre-Rendered RGB Visualisation',
    stops: ['var(--calcite-color-brand)', 'var(--calcite-color-status-info)', 'var(--calcite-color-status-warning)'],
    description: 'Original RGBA GeoTIFF rendering preserved directly from source.',
  },
  feature_streams: {
    label: 'Tana River Network (Local Vector)',
    stops: ['var(--calcite-color-brand)'],
    description: 'Vector polyline river network from ArcGIS FeatureServer.',
  },
  geoglows_forecast: {
    label: 'GEOGLOWS River Streamflow Forecast (m³/s & Return-Period Exceedance)',
    stops: ['#38bdf8', '#22c55e', '#facc15', '#f97316', '#dc2626'],
    description: 'Esri Living Atlas / GEOGLOWS Global Water Model streamflow forecast return-period classes.',
  },
};

export const LAND_COVER_SWATCHES: LegendSwatch[] = [
  { color: '#006400', label: 'Tree cover', valueRange: '10' },
  { color: '#ffbb22', label: 'Shrubland', valueRange: '20' },
  { color: '#ffff4c', label: 'Grassland', valueRange: '30' },
  { color: '#f096ff', label: 'Cropland', valueRange: '40' },
  { color: '#fa0000', label: 'Built-up', valueRange: '50' },
  { color: '#b4b4b4', label: 'Bare / sparse vegetation', valueRange: '60' },
  { color: '#0064c8', label: 'Permanent water bodies', valueRange: '80' },
  { color: '#0096a0', label: 'Herbaceous wetland', valueRange: '90' },
];

export const FLOW_DIR_SWATCHES: LegendSwatch[] = [
  { color: '#e41a1c', label: 'East (1)', valueRange: '1' },
  { color: '#ff7f00', label: 'Southeast (2)', valueRange: '2' },
  { color: '#ffff33', label: 'South (4)', valueRange: '4' },
  { color: '#4daf4a', label: 'Southwest (8)', valueRange: '8' },
  { color: '#377eb8', label: 'West (16)', valueRange: '16' },
  { color: '#984ea3', label: 'Northwest (32)', valueRange: '32' },
  { color: '#a65628', label: 'North (64)', valueRange: '64' },
  { color: '#f781bf', label: 'Northeast (128)', valueRange: '128' },
];

export const SW_TRANSITION_SWATCHES: LegendSwatch[] = [
  { color: '#08306b', label: 'Permanent water', valueRange: '1' },
  { color: '#22c55e', label: 'New permanent', valueRange: '2' },
  { color: '#dc2626', label: 'Lost permanent', valueRange: '3' },
  { color: '#38bdf8', label: 'Seasonal water', valueRange: '4' },
  { color: '#34d399', label: 'New seasonal', valueRange: '5' },
  { color: '#f97316', label: 'Lost seasonal', valueRange: '6' },
  { color: '#0284c7', label: 'Seasonal to permanent', valueRange: '7' },
  { color: '#eab308', label: 'Permanent to seasonal', valueRange: '8' },
  { color: '#a855f7', label: 'Ephemeral permanent', valueRange: '9' },
  { color: '#c084fc', label: 'Ephemeral seasonal', valueRange: '10' },
];
