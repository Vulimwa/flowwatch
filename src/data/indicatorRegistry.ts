import type { IndicatorDefinition } from '../types/geospatial';

export const INDICATOR_REGISTRY: IndicatorDefinition[] = [
  {
    id: 'ind_chirps_ytd_anomaly',
    name: 'CHIRPS Precipitation Anomaly (YTD & Seasonal)',
    workspace: 'catchment_response',
    scientificDefinition:
      'Departure of 2026 satellite-gauge blended rainfall (mm, %, and standardized z-score) relative to the matched 2001–2025 climatological baseline over identical calendar months.',
    formulaOrMethod:
      'Anom_mm = P_2026(Jan–Sep) − P_base(Jan–Sep); Anom_% = 100 × Anom_mm / P_base; Z = Anom_mm / SD_2001_2025.',
    inputDatasetIds: [
      'chirps_anomaly_2026',
      'chirps_seasonal_2026',
      'chirps_seasonal_clim',
      'chirps_monthly_2026',
      'chirps_monthly_clim',
    ],
    units: 'mm, %, σ (z-score)',
    temporalAggregation: 'Matched partial-year Jan–Sep 2026 vs 2001–2025 Jan–Sep mean; OND excluded as incomplete.',
    spatialAggregation: 'Native 0.05° (~5.5 km) pixels masked inside Upper Tana sub-basin polygons (NoData = -9999 excluded).',
    validityRequirements: 'Do not compare partial 2026 (9 months) against 12-month historical totals without temporal matching.',
    confidenceStatus: 'Verified',
    interpretationRules: [
      'Positive anomalies indicate wetter-than-normal atmospheric precipitation inputs.',
      'Rainfall anomalies measure meteorological input, NOT river discharge or verified flooding.',
    ],
    limitations: [
      '0.05° grid cells smooth localized convective storm peaks on steep Mt. Kenya slopes.',
      'Sub-basins smaller than ~1,000 km² contain limited CHIRPS pixel centers.',
    ],
  },
  {
    id: 'ind_era5_soil_moisture',
    name: 'ERA5-Land Root-Zone Soil Moisture Anomaly (0–100 cm)',
    workspace: 'catchment_response',
    scientificDefinition:
      'Volumetric soil water departure in the 0–100 cm profile (weighted across ERA5-Land layers 1–3 and composite band 4) relative to the 2001–2025 seasonal baseline.',
    formulaOrMethod: 'SM_anom = θ_2026(0–100 cm) − θ_base_2001_2025(0–100 cm); Z = SM_anom / SD_base.',
    inputDatasetIds: ['era5_sm_recent_2026', 'era5_sm_baseline', 'era5_sm_anomaly_2026'],
    units: 'm³/m³ and σ (z-score)',
    temporalAggregation: 'Recent 2026 window vs matched 2001–2025 reanalysis reference.',
    spatialAggregation: 'Native 0.10° (~11 km) ERA5-Land grid centers falling within sub-basin geometry.',
    validityRequirements: 'Reanalysis product; check valid pixel count per sub-basin due to 0.10° coarseness.',
    confidenceStatus: 'Modelled / Conditional',
    interpretationRules: [
      'Elevated soil moisture suggests reduced infiltration capacity and greater runoff efficiency during rain events.',
      'Negative soil moisture anomaly indicates drier catchment antecedent state, not standalone agricultural drought.',
    ],
    limitations: [
      '0.10° (~11 km) resolution cannot resolve narrow riparian corridors or small irrigated valleys.',
      'Modelled land-surface reanalysis, not in-situ soil probe telemetry.',
    ],
  },
  {
    id: 'ind_era5_pet_demand',
    name: 'ERA5-Land Potential Evapotranspiration (PET)',
    workspace: 'catchment_response',
    scientificDefinition:
      'Atmospheric evaporative demand under reference well-watered conditions (mm/day) and its anomaly against the 2001–2025 baseline.',
    formulaOrMethod: 'PET_anom = PET_2026 − PET_base_2001_2025.',
    inputDatasetIds: ['era5_pet_2026', 'era5_temperature_2026'],
    units: 'mm/day',
    temporalAggregation: 'Recent 2026 window vs 2001–2025 baseline.',
    spatialAggregation: 'Native 0.10° (~11 km) ERA5-Land grid centers inside sub-basin geometry.',
    validityRequirements: 'Must be interpreted strictly as atmospheric evaporative demand, never actual evapotranspiration.',
    confidenceStatus: 'Modelled / Conditional',
    interpretationRules: [
      'Higher PET alongside rainfall deficits can accelerate soil drying.',
      'Do not calculate a composite drought index from PET alone.',
    ],
    limitations: [
      'PET does not measure actual crop transpiration, soil evaporation, or water abstraction.',
    ],
  },
  {
    id: 'ind_geoglows_forecast_stats',
    name: 'GEOGLOWS 15-Day Ensemble Streamflow & Spread',
    workspace: 'streamflow',
    scientificDefinition:
      'ECMWF medium-range 51-member ensemble runoff-routed river discharge statistics (min, P25, median, mean, P75, max) plus the separate deterministic high-resolution (HRES, days 1–10) trajectory.',
    formulaOrMethod:
      'Retrieved directly from GEOGLOWS REST API v2 /forecaststats/{linkno}; IQR_width = Q75 − Q25; Spread_ratio = IQR_width / max(Q50, 0.01).',
    inputDatasetIds: ['geoglows_forecast', 'tana_river_streams'],
    units: 'm³/s (UTC timestamps)',
    temporalAggregation: '3-hourly forecast steps over 15 days (51-member stats) and 10 days (separate HRES member).',
    spatialAggregation: 'Individual verified TDX-Hydro reach segment identified by LINKNO.',
    validityRequirements:
      'LINKNO must be verified in the Upper Tana AOI index; 51-member statistics must never be mixed with the separate HRES member.',
    confidenceStatus: 'Modelled / Conditional',
    interpretationRules: [
      'Wide IQR/min-max spreads indicate substantial ensemble uncertainty.',
      'Elevation of forecast discharge is a hydrological model signal, not a guarantee of overbank flooding.',
    ],
    limitations: [
      'Global runoff routing excludes dynamic KenGen gate rules on Masinga and Seven Forks reservoirs.',
      'Requires reach-by-reach calibration against Kenyan WRA gauging stations for operational flood warning.',
    ],
  },
  {
    id: 'ind_geoglows_hist_percentile',
    name: 'Forecast Percentile vs Modelled Historical Distribution',
    workspace: 'streamflow',
    scientificDefinition:
      'Empirical rank percentile of the peak 15-day forecast median discharge within the reach’s 1940–present ERA5-forced retrospective monthly simulation, plus ratio to the matched calendar-month median.',
    formulaOrMethod:
      'Percentile = 100 × count(Q_hist <= Q_peak_med) / N_hist; Seasonal_ratio = Q_peak_med / Median(Q_hist_same_month).',
    inputDatasetIds: ['geoglows_forecast'],
    units: 'Percentile (0–100) and dimensionless ratio',
    temporalAggregation: '15-day forecast peak compared against 1940–present retrospective monthly distribution & seasonal cycle.',
    spatialAggregation: 'Reach-specific (LINKNO).',
    validityRequirements: 'Requires >= 120 historical retrospective records for the selected LINKNO.',
    confidenceStatus: 'Modelled / Conditional',
    interpretationRules: [
      '>= 90th percentile indicates unusually high modelled flow; <= 10th percentile indicates unusually low modelled flow.',
      'Retrospective baseline is modelled ERA5-forced streamflow, not direct gauge measurements.',
    ],
    limitations: [
      'Monthly retrospective averages smooth brief daily peak spikes compared to 3-hourly forecast steps.',
    ],
  },
  {
    id: 'ind_geoglows_rp_exceedance',
    name: 'Return-Period Threshold Comparison & Exceedance Duration',
    workspace: 'streamflow',
    scientificDefinition:
      'Comparison of forecast median and ensemble max flows against Gumbel Extreme Value Type I return-period thresholds (2, 5, 10, 25, 50, 100 yr) and cumulative hours exceeding thresholds.',
    formulaOrMethod:
      'Hours_above_RP = count(Q_step >= RP_threshold) × 3 hours; retrieved from GEOGLOWS v2 Gumbel store.',
    inputDatasetIds: ['geoglows_forecast'],
    units: 'm³/s and hours (%)',
    temporalAggregation: '3-hourly forecast steps over the active 15-day run.',
    spatialAggregation: 'Reach-specific (LINKNO).',
    validityRequirements: 'Gumbel thresholds derived from GEOGLOWS 1940–present annual maxima.',
    confidenceStatus: 'Modelled / Conditional',
    interpretationRules: [
      'Exceeding a 2-yr or 5-yr threshold indicates elevated modelled flow warranting scrutiny, NOT confirmed inundation.',
    ],
    limitations: [
      'Statistical model thresholds are not official Kenyan WRA flood warning levels or channel bankfull surveys.',
    ],
  },
  {
    id: 'ind_catchment_consistency',
    name: 'Catchment Hydrological Signal Consistency',
    workspace: 'catchment_response',
    scientificDefinition:
      'Structured cross-check assessing whether rainfall anomaly, soil moisture anomaly, PET atmospheric demand, and selected reach streamflow point in a coherent hydrological direction.',
    formulaOrMethod:
      'Rule-based multi-signal direction check yielding: Consistent | Partially consistent | Contradictory | Insufficient for interpretation.',
    inputDatasetIds: ['chirps_anomaly_2026', 'era5_sm_anomaly_2026', 'era5_pet_2026', 'geoglows_forecast'],
    units: 'Categorical assessment',
    temporalAggregation: '2026 seasonal catchment state vs active 15-day GEOGLOWS forecast.',
    spatialAggregation: 'Selected sub-basin polygon compared with selected verified reach.',
    validityRequirements: 'Requires valid sub-basin zonal statistics; never collapsed into a single numeric score.',
    confidenceStatus: 'Modelled / Conditional',
    interpretationRules: [
      'Rainfall over a single pixel or sub-basin does not solely determine discharge on mainstem reaches draining upstream basins.',
    ],
    limitations: [
      'Catchment EO anomalies (Jan–Sep 2026) and current 15-day river forecasts span different time horizons.',
    ],
  },
  {
    id: 'ind_proximity_exposure_screening',
    name: 'River Corridor Proximity & Population 2025 Screening',
    workspace: 'impact_exposure',
    scientificDefinition:
      'Non-double-counted summation of 2025 gridded population, Built-up 2020 cover, HAND terrain classes, ESA WorldCover 10 m composition, and distance-filtered settlements/facilities within a configurable buffer of a verified river reach.',
    formulaOrMethod:
      'Unique native raster cells whose centers lie <= buffer_m (EPSG:32737) from the selected reach polyline; NoData excluded; zero cell duplication.',
    inputDatasetIds: [
      'population_2025',
      'builtup_2020',
      'hand',
      'land_cover',
      'surface_water_occurrence',
      'kenya_towns',
      'kenya_health_facilities',
      'kenya_primary_schools',
    ],
    units: 'Estimated people, %, meters (HAND), feature counts',
    temporalAggregation: 'Static/epoch screening (Pop 2025, Built-up 2020, JRC 1984–2021, MOH/Towns).',
    spatialAggregation: 'Configurable polyline corridor buffer (500 m, 1 km, 2 km, 5 km) in UTM Zone 37S.',
    validityRequirements: 'Screening estimate ONLY; explicitly distinguish proximity distance from hydraulic flood extent.',
    confidenceStatus: 'Screening Estimate',
    interpretationRules: [
      'A proximity buffer is NOT a flood boundary, and population inside a buffer does not imply every resident is affected.',
      'HAND < 5 m highlights low-lying terrain near drainage, NOT calibrated flood depth.',
    ],
    limitations: [
      'Population 2025 (~100 m) and Built-up 2020 (~100 m) use native cell-center inclusion without sub-pixel dasymetric weighting.',
      '2020 built-up epoch may omit recent post-2020 peri-urban expansion.',
    ],
  },
  {
    id: 'ind_reservoir_mass_balance',
    name: 'Hypothetical Reservoir Storage & Downstream Sensitivity',
    workspace: 'water_operations',
    scientificDefinition:
      'Transparent conservation-of-mass exploration of reservoir storage change, uncontrolled spill, supply deficit, and downstream combined flow under user-specified assumptions.',
    formulaOrMethod:
      'ΔS = (Q_in × 0.0864 × Δt) − (E_mm_d × Area_km² × Δt × 0.001) − V_release; Spill = max(0, S_raw − Capacity); Q_down = Q_out × (1 − Atten%) + Q_trib.',
    inputDatasetIds: ['geoglows_forecast'],
    units: 'MCM (storage/volume) and m³/s (discharge)',
    temporalAggregation: 'Configurable scenario duration (7–90 days) + 6-month seasonal tapering illustration + ±25% inflow sensitivity.',
    spatialAggregation: 'Single conceptual reservoir storage node (distinct from Seven Forks full cascade routing).',
    validityRequirements: 'Explicitly labelled hypothetical unless validated KenGen operational rule curves & SCADA telemetry are supplied.',
    confidenceStatus: 'Hypothetical',
    interpretationRules: [
      'GEOGLOWS discharge at an arbitrary reach is not automatically reservoir inflow.',
      'Masinga releases do not reach Garissa unchanged due to Kamburu–Kiambere cascade operations and tributaries.',
    ],
    limitations: [
      'No live KenGen reservoir level, spillway gate opening, or turbine dispatch telemetry is connected.',
    ],
  },
];

export const INDICATOR_BY_ID: Record<string, IndicatorDefinition> = Object.fromEntries(
  INDICATOR_REGISTRY.map((ind) => [ind.id, ind])
);
