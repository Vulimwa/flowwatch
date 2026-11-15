export const TANA_BASIN_AOI_EXTENT = {
  xmin: 36.55,
  ymin: -1.25,
  xmax: 38.65,
  ymax: 0.45,
  spatialReference: { wkid: 4326 },
} as const;

export const TANA_BASIN_CENTER: [number, number] = [37.6, -0.4];

export interface BasemapOption {
  id: string;
  label: string;
  description: string;
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: 'topo-vector',
    label: 'Topographic',
    description: 'Esri vector topographic basemap with terrain contours and hydrography.',
  },
  {
    id: 'gray-vector',
    label: 'Light Grey Canvas',
    description: 'Neutral light reference canvas ideal for analytical raster overlays.',
  },
  {
    id: 'hybrid',
    label: 'Satellite Hybrid',
    description: 'High-resolution Earth imagery with place names and boundaries.',
  },
  {
    id: 'terrain',
    label: 'Terrain with Labels',
    description: 'Shaded relief emphasising Mount Kenya and Tana valley topography.',
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    description: 'Community-mapped road, settlement, and river corridor reference.',
  },
];

export const TANA_REFERENCE_LOCATIONS = [
  { name: 'Upper Tana Headwaters (Mt. Kenya / Nyeri)', lon: 37.2, lat: -0.25 },
  { name: 'Masinga Reservoir Zone (Seven Forks)', lon: 37.59, lat: -0.88 },
  { name: 'Kamburu & Gitaru Cascade', lon: 37.71, lat: -0.81 },
  { name: 'Kindaruma & Kiambere Reach', lon: 37.88, lat: -0.74 },
  { name: 'Thika–Sagana Confluence', lon: 37.31, lat: -0.87 },
  { name: 'Upper-Middle Basin Outlet (East)', lon: 38.45, lat: -0.35 },
] as const;

export interface CameraPreset3D {
  id: string;
  label: string;
  description: string;
  position: [number, number, number]; // [lon, lat, altitudeMeters]
  heading: number;
  tilt: number;
}

export const TANA_3D_CAMERA_PRESETS: CameraPreset3D[] = [
  {
    id: 'basin_oblique',
    label: 'Upper Tana Basin Oblique',
    description: 'Full basin vista looking NNW toward Mount Kenya headwaters',
    position: [38.32, -1.62, 132000],
    heading: 332,
    tilt: 56,
  },
  {
    id: 'mt_kenya_headwaters',
    label: 'Mt. Kenya Alpine Headwaters',
    description: 'Steep volcanic slopes feeding Nyeri, Sagana, and Chania tributaries',
    position: [37.48, -0.58, 36000],
    heading: 334,
    tilt: 66,
  },
  {
    id: 'masinga_reservoir',
    label: 'Masinga Dam & Reservoir',
    description: 'Lead storage impoundment looking northeast into Seven Forks',
    position: [37.45, -1.12, 16500],
    heading: 38,
    tilt: 64,
  },
  {
    id: 'seven_forks_cascade',
    label: 'Seven Forks Gorge Cascade',
    description: 'Kamburu, Gitaru, Kindaruma, and Kiambere hydroelectric canyon',
    position: [37.54, -1.04, 19500],
    heading: 58,
    tilt: 63,
  },
  {
    id: 'thika_sagana_confluence',
    label: 'Thika–Sagana Confluence',
    description: 'Central agricultural corridor and valley floor floodplain',
    position: [37.16, -1.14, 17500],
    heading: 30,
    tilt: 62,
  },
];

export const TERRAIN_EXAGGERATION_OPTIONS: Array<{
  value: number;
  label: string;
  shortLabel: string;
}> = [
  { value: 1, label: '1× True Scale', shortLabel: '1×' },
  { value: 1.5, label: '1.5× Subtle Relief', shortLabel: '1.5×' },
  { value: 2, label: '2× Enhanced Basin Relief', shortLabel: '2×' },
  { value: 3, label: '3× Dramatic Canyon Relief', shortLabel: '3×' },
];

