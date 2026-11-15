import type {
  DamMonthlyStep,
  DamScenarioParams,
  DamScenarioResult,
} from '../types/geospatial';

export const ILLUSTRATIVE_DAM_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  params: DamScenarioParams;
}> = [
  {
    id: 'baseline-mam',
    label: 'Balanced Long Rains (MAM)',
    description:
      'Moderate starting storage with typical Long Rains inflow and steady hydropower/downstream environmental release.',
    params: {
      id: 'baseline-mam',
      name: 'Balanced Long Rains',
      initialStorageMcm: 920,
      capacityMcm: 1560,
      deadStorageMcm: 180,
      inflowM3s: 165,
      proposedReleaseM3s: 110,
      downstreamTributaryM3s: 35,
      attenuationPct: 12,
      evapLossMmDay: 5.2,
      surfaceAreaKm2: 110,
      days: 30,
    },
  },
  {
    id: 'el-nino-surge',
    label: 'El Niño Wet Surge (High Inflow)',
    description:
      'High reservoir storage entering peak rains with elevated catchment inflow, illustrating flood-spill vs pre-release trade-offs.',
    params: {
      id: 'el-nino-surge',
      name: 'El Niño Wet Surge',
      initialStorageMcm: 1380,
      capacityMcm: 1560,
      deadStorageMcm: 180,
      inflowM3s: 390,
      proposedReleaseM3s: 190,
      downstreamTributaryM3s: 95,
      attenuationPct: 8,
      evapLossMmDay: 4.5,
      surfaceAreaKm2: 122,
      days: 30,
    },
  },
  {
    id: 'dry-spell-conservation',
    label: 'Below-Average Rains (Drawdown)',
    description:
      'Low inflow scenario illustrating competing demands between maintaining reservoir head/water supply and sustaining downstream baseflow.',
    params: {
      id: 'dry-spell-conservation',
      name: 'Dry Spell Conservation',
      initialStorageMcm: 540,
      capacityMcm: 1560,
      deadStorageMcm: 180,
      inflowM3s: 42,
      proposedReleaseM3s: 75,
      downstreamTributaryM3s: 12,
      attenuationPct: 18,
      evapLossMmDay: 6.4,
      surfaceAreaKm2: 88,
      days: 30,
    },
  },
  {
    id: 'pre-release-buffer',
    label: 'Proactive Pre-Release Buffer',
    description:
      'Controlled early release prior to high inflow to preserve flood-attenuation headspace without uncontrolled spillway overflow.',
    params: {
      id: 'pre-release-buffer',
      name: 'Proactive Pre-Release',
      initialStorageMcm: 1220,
      capacityMcm: 1560,
      deadStorageMcm: 180,
      inflowM3s: 340,
      proposedReleaseM3s: 260,
      downstreamTributaryM3s: 70,
      attenuationPct: 10,
      evapLossMmDay: 4.8,
      surfaceAreaKm2: 118,
      days: 30,
    },
  },
];

const SECONDS_PER_DAY = 86400;

/**
 * Computes transparent illustrative reservoir mass-balance over 1 primary step + 6-month projection.
 * 1 m3/s * 86,400 s/day / 1,000,000 = 0.0864 MCM/day
 */
export function runIllustrativeDamSimulation(
  params: DamScenarioParams
): DamScenarioResult {
  const m3sToMcmPerDay = SECONDS_PER_DAY / 1e6; // 0.0864

  const stepStep = (
    startStorage: number,
    inflowRate: number,
    releaseRate: number,
    days: number
  ) => {
    const inflowMcm = inflowRate * m3sToMcmPerDay * days;
    const plannedReleaseMcm = releaseRate * m3sToMcmPerDay * days;
    // Evaporation volume (MCM) = (mm/day / 1000) * (km2 * 1e6 m2) * days / 1e6 = mm/day * km2 * days * 0.001
    const evapMcm = params.evapLossMmDay * params.surfaceAreaKm2 * days * 0.001;

    const availableAboveDead = Math.max(0, startStorage + inflowMcm - evapMcm - params.deadStorageMcm);
    const actualReleaseMcm = Math.min(plannedReleaseMcm, availableAboveDead);
    const deficitMcm = Math.max(0, plannedReleaseMcm - actualReleaseMcm);

    const rawEnd = startStorage + inflowMcm - evapMcm - actualReleaseMcm;
    const spillMcm = Math.max(0, rawEnd - params.capacityMcm);
    const endStorageMcm = Math.max(params.deadStorageMcm, Math.min(params.capacityMcm, rawEnd));

    const totalOutflowM3s = (actualReleaseMcm + spillMcm) / (m3sToMcmPerDay * days);
    // Account explicitly for cascade/channel attenuation + intermediate tributaries
    const attenuatedReleaseM3s = totalOutflowM3s * (1 - params.attenuationPct / 100);
    const downstreamFlowM3s = attenuatedReleaseM3s + params.downstreamTributaryM3s;

    return {
      inflowMcm,
      plannedReleaseMcm,
      actualReleaseMcm,
      evapMcm,
      spillMcm,
      endStorageMcm,
      deficitMcm,
      downstreamFlowM3s,
    };
  };

  const primary = stepStep(
    params.initialStorageMcm,
    params.inflowM3s,
    params.proposedReleaseM3s,
    params.days
  );

  // Build 6-month illustrative trajectory (30-day steps with seasonal tapering)
  const projection: DamMonthlyStep[] = [];
  let rollingStorage = params.initialStorageMcm;
  const seasonalMultipliers = [1.0, 1.08, 0.96, 0.82, 0.72, 0.68];

  for (let m = 0; m < 6; m++) {
    const mult = seasonalMultipliers[m];
    const step = stepStep(
      rollingStorage,
      params.inflowM3s * mult,
      params.proposedReleaseM3s,
      30
    );
    projection.push({
      monthIndex: m + 1,
      label: `Month +${m + 1}`,
      startStorageMcm: rollingStorage,
      inflowMcm: step.inflowMcm,
      releaseMcm: step.actualReleaseMcm,
      evapMcm: step.evapMcm,
      spillMcm: step.spillMcm,
      endStorageMcm: step.endStorageMcm,
      downstreamFlowM3s: step.downstreamFlowM3s,
      fillPct: (step.endStorageMcm / params.capacityMcm) * 100,
    });
    rollingStorage = step.endStorageMcm;
  }

  const fillPct = (primary.endStorageMcm / params.capacityMcm) * 100;
  const storageDeltaMcm = primary.endStorageMcm - params.initialStorageMcm;

  let storageRiskStatus: DamScenarioResult['storageRiskStatus'] = 'Balanced';
  if (primary.spillMcm > 1 || fillPct >= 95) {
    storageRiskStatus = 'High Spill Risk';
  } else if (fillPct <= 25 || primary.deficitMcm > 0) {
    storageRiskStatus = 'Critical Low';
  } else if (fillPct <= 45) {
    storageRiskStatus = 'Watch Low';
  }

  let downstreamStatus: DamScenarioResult['downstreamStatus'] = 'Moderate Flow';
  if (primary.downstreamFlowM3s >= 320 || primary.spillMcm > 20) {
    downstreamStatus = 'High Spillway Surge';
  } else if (primary.downstreamFlowM3s >= 200) {
    downstreamStatus = 'Elevated Release';
  } else if (primary.downstreamFlowM3s < 65) {
    downstreamStatus = 'Low Baseflow';
  }

  return {
    params,
    inflowVolumeMcm: primary.inflowMcm,
    plannedReleaseMcm: primary.plannedReleaseMcm,
    actualReleaseMcm: primary.actualReleaseMcm,
    evapLossMcm: primary.evapMcm,
    spillMcm: primary.spillMcm,
    remainingStorageMcm: primary.endStorageMcm,
    storageDeltaMcm,
    fillPct,
    downstreamAtOutletM3s: primary.downstreamFlowM3s,
    deficitMcm: primary.deficitMcm,
    storageRiskStatus,
    downstreamStatus,
    projection,
  };
}
