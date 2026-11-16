import type { AppModuleId, SupportingToolId } from '../types/geospatial';

export type CatchmentGuideSection = 'rainfall' | 'soil-pet' | 'sub-basins' | 'terrain-routing';

export interface VoiceGuideContext {
  title: string;
  narration: string;
}

export const MODULE_GUIDE: Record<AppModuleId, VoiceGuideContext> = {
  basin_situation: {
    title: 'Basin Situation',
    narration:
      'This overview brings together the Upper Tana climate context, catchment response, modelled river signals and corridor screening. Use the workspace icons to open each analysis. Rainfall and terrain indicators are screening evidence, not a flood forecast or a field measurement.',
  },
  streamflow: {
    title: 'Streamflow',
    narration:
      'This workspace examines GEOGLOWS modelled streamflow forecasts, historical simulations, ensembles and return-period summaries for a selected verified river reach. These are model outputs, not gauge observations. If the service is unavailable, the panel reports that status rather than inventing a value.',
  },
  catchment_response: {
    title: 'Catchment Response',
    narration:
      'Catchment Response compares rainfall, soil moisture, potential evapotranspiration, sub-basin summaries and terrain indicators. Use its tabs to switch between those analyses. An anomaly describes a difference from a reference period; it does not by itself establish flood or drought impacts.',
  },
  impact_exposure: {
    title: 'Impact & Exposure',
    narration:
      'This workspace screens population and built-up exposure alongside terrain and river indicators. The results are planning context, not a validated inundation boundary, damage estimate or prediction of who will be affected.',
  },
  water_operations: {
    title: 'Water Operations',
    narration:
      'The Water Operations Lab compares illustrative reservoir scenarios. Its storage and release outputs are hypothetical calculations, not KenGen SCADA, operational instructions or measured reservoir inflows. A selected river reach discharge is not a reservoir inflow observation.',
  },
  river_3d_explorer: {
    title: '3D Intelligence Explorer',
    narration:
      'The 3D explorer combines terrain, river-reach profiles and available catchment information in the application’s shared SceneView. Vertical exaggeration changes display only, not the underlying elevation. Downstream movement is shown only where local reach geometry supports an unambiguous connection; this dataset does not establish a complete river route.',
  },
};

export const CATCHMENT_GUIDE: Record<CatchmentGuideSection, VoiceGuideContext> = {
  rainfall: {
    title: 'Rainfall',
    narration:
      'This tab compares CHIRPS rainfall for January through September 2026 with the matching 2001 to 2025 reference window. The map and chart show gridded rainfall and its anomaly. These data describe rainfall patterns; they are not direct streamflow measurements or a flood boundary.',
  },
  'soil-pet': {
    title: 'Soil Moisture & PET',
    narration:
      'This tab shows ERA5-Land soil-moisture anomaly and potential evapotranspiration products. Soil moisture and atmospheric water demand are different indicators, and neither is a direct measurement of river flow. Check the displayed period, units and layer status before interpreting the map.',
  },
  'sub-basins': {
    title: 'Sub-Basins',
    narration:
      'This tab summarizes the five available Upper Tana HydroBASINS Level 7 polygons and lets you focus the map on an individual sub-basin or their union. Zonal summaries describe the available gridded inputs within those polygons; they do not imply that every source has identical coverage or resolution.',
  },
  'terrain-routing': {
    title: 'Terrain & Routing',
    narration:
      'This tab uses elevation-derived terrain indicators, including flow direction, accumulation and HAND where available. Terrain routing is a screening aid, not a calibrated hydraulic model. Depressions, culverts, channels and infrastructure may not be represented in the source elevation data.',
  },
};

export const TOOL_GUIDE: Record<SupportingToolId, VoiceGuideContext> = {
  layers: {
    title: 'Layers',
    narration:
      'Use Layers to turn map datasets on or off and inspect the active map products, including rainfall, soil moisture, terrain, rivers, population and built-up layers when available. A layer can be enabled while its service is still loading or has reported an error; check its visible status before interpreting the map.',
  },
  registry: {
    title: 'Data Registry',
    narration:
      'The Data Registry lists the application’s data sources and their documented metadata. Review the source, date range, units and limitations before comparing products. Registry information describes the dataset; it does not guarantee that a remote service is currently responding.',
  },
  indicators: {
    title: 'Indicator Registry',
    narration:
      'The Indicator Registry explains the application’s derived indicators and their assumptions. Read each definition and caveat alongside the map; derived screening indicators should not be treated as observations or operational forecasts.',
  },
};

export type GuidedDemoFocus =
  | 'workspace-navigation'
  | 'rainfall-layer'
  | 'soil-pet-layer'
  | 'river-forecast-chart'
  | 'terrain-profile'
  | 'exposure-layers'
  | 'dam-controls';

export interface GuidedDemoStep {
  id: string;
  chapter: string;
  title: string;
  module: AppModuleId;
  focus: GuidedDemoFocus;
  durationMs: number;
  narration: string;
}

export const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  {
    id: 'basin-question',
    chapter: 'Chapter 1 of 7',
    title: 'Frame the basin question',
    module: 'basin_situation',
    focus: 'workspace-navigation',
    durationMs: 40_000,
    narration:
      'We begin in the Upper Tana overview. The question is how climate signals, catchment conditions and river information can help frame water-risk decisions. The workspace navigation opens each part of the analysis; no single indicator answers that question on its own.',
  },
  {
    id: 'rainfall-signal',
    chapter: 'Chapter 2 of 7',
    title: 'Explore the rainfall signal',
    module: 'catchment_response',
    focus: 'rainfall-layer',
    durationMs: 45_000,
    narration:
      'The rainfall view compares CHIRPS estimates for January through September 2026 with the same months in the 2001 to 2025 reference period. This is a gridded rainfall anomaly, not a direct observation at every location and not a flood forecast. Check the layer status and legend as the map loads.',
  },
  {
    id: 'soil-and-demand',
    chapter: 'Chapter 3 of 7',
    title: 'Compare soil moisture and demand',
    module: 'catchment_response',
    focus: 'soil-pet-layer',
    durationMs: 40_000,
    narration:
      'Next, compare the ERA5-Land soil-moisture anomaly with potential evapotranspiration. These products describe different parts of the water balance and have their own spatial and temporal limits. They provide context for catchment response; they do not prove a specific flood or drought impact.',
  },
  {
    id: 'river-signal',
    chapter: 'Chapter 4 of 7',
    title: 'Inspect the modelled river signal',
    module: 'streamflow',
    focus: 'river-forecast-chart',
    durationMs: 60_000,
    narration:
      'The streamflow workspace presents GEOGLOWS model products for a verified local reach. Forecasts and historical simulations are modelled values, not gauge observations. Remote forecast or history services may be unavailable; if so, use the on-screen status and do not infer missing values.',
  },
  {
    id: 'terrain-and-network',
    chapter: 'Chapter 5 of 7',
    title: 'Inspect terrain and river connectivity',
    module: 'river_3d_explorer',
    focus: 'terrain-profile',
    durationMs: 75_000,
    narration:
      'In the shared 3D scene, terrain and a locally verified river reach can be examined together. The available network supports only short, unambiguous geometry-based connections in some locations. The explorer stops when a connection is missing or ambiguous; it does not imply a continuous downstream route. Vertical exaggeration affects display, not measured elevation.',
  },
  {
    id: 'exposure-screen',
    chapter: 'Chapter 6 of 7',
    title: 'Screen exposure context',
    module: 'impact_exposure',
    focus: 'exposure-layers',
    durationMs: 50_000,
    narration:
      'This exposure screen places population and built-up context alongside terrain and river indicators. It helps identify where more investigation may be useful, but it is not a validated inundation model, a damage estimate or a count of people certain to be affected.',
  },
  {
    id: 'operations-scenario',
    chapter: 'Chapter 7 of 7',
    title: 'Compare an illustrative operations scenario',
    module: 'water_operations',
    focus: 'dam-controls',
    durationMs: 45_000,
    narration:
      'The final workspace compares illustrative storage and release scenarios. Every scenario input and output here is hypothetical: the application has no KenGen SCADA feed, and a GEOGLOWS reach value is not a reservoir inflow measurement. These calculations are for exploring trade-offs, not issuing operating instructions.',
  },
];

export const GUIDED_DEMO_CONCLUSION =
  'The guided tour is complete. FlowWatch Africa brings together climate, catchment, river and exposure context, while keeping model outputs, data gaps and hypothetical scenarios distinct. Use the workspace navigation to explore further and consult the displayed sources and limitations before drawing conclusions.';
