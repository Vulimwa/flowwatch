import type { DamScenarioParams, DamScenarioResult } from '../types/geospatial';
import { runIllustrativeDamSimulation } from '../utils/damSimulator';

export interface ReleaseStrategyComparison {
  lowRelease: DamScenarioResult;
  baselineRelease: DamScenarioResult;
  highRelease: DamScenarioResult;
  inflowLow25: DamScenarioResult;
  inflowHigh25: DamScenarioResult;
  tradeOffSummary: string;
}

export const TANA_HYDROPOWER_ASSETS = [
  {
    name: 'Masinga Dam',
    role: 'Primary multi-year storage reservoir',
    capacityNote: 'Approx. 1,560 MCM design storage capacity (illustrative baseline)',
    scopeNote:
      'Governs seasonal storage accumulation and upstream buffer for the entire Seven Forks cascade.',
  },
  {
    name: 'Kamburu, Gitaru, Kindaruma & Kiambere',
    role: 'Downstream run-of-river / cascading hydropower stations',
    capacityNote: 'Operated sequentially below Masinga',
    scopeNote:
      'Modify and re-regulate Masinga releases before water enters the middle/lower Tana mainstem.',
  },
  {
    name: 'Thika / Chania / Sagana & Mt. Kenya East Tributaries',
    role: 'Unregulated / partially regulated inflows',
    capacityNote: 'Contribute lateral discharge upstream and downstream of Masinga',
    scopeNote:
      'Downstream towns (including Garissa) receive combined cascade releases plus unregulated tributary runoff.',
  },
] as const;

export function runReleaseTradeoffAndSensitivity(
  base: DamScenarioParams
): ReleaseStrategyComparison {
  const lowRelRate = Math.max(15, Math.round(base.proposedReleaseM3s * 0.65));
  const highRelRate = Math.min(450, Math.round(base.proposedReleaseM3s * 1.4));

  const lowRelease = runIllustrativeDamSimulation({
    ...base,
    id: `${base.id}-low`,
    name: 'Lower Release (-35%)',
    proposedReleaseM3s: lowRelRate,
  });

  const baselineRelease = runIllustrativeDamSimulation({
    ...base,
    name: 'Baseline Proposed Release',
  });

  const highRelease = runIllustrativeDamSimulation({
    ...base,
    id: `${base.id}-high`,
    name: 'Higher Release (+40%)',
    proposedReleaseM3s: highRelRate,
  });

  const inflowLow25 = runIllustrativeDamSimulation({
    ...base,
    id: `${base.id}-inflow-minus25`,
    name: 'Inflow -25% Sensitivity',
    inflowM3s: Math.max(5, Math.round(base.inflowM3s * 0.75)),
  });

  const inflowHigh25 = runIllustrativeDamSimulation({
    ...base,
    id: `${base.id}-inflow-plus25`,
    name: 'Inflow +25% Sensitivity',
    inflowM3s: Math.min(750, Math.round(base.inflowM3s * 1.25)),
  });

  let tradeOffSummary = '';
  if (highRelease.spillMcm < lowRelease.spillMcm && lowRelease.spillMcm > 1) {
    tradeOffSummary = `Increasing planned release from ${lowRelRate} to ${highRelRate} m³/s reduces uncontrolled spill from ${lowRelease.spillMcm.toFixed(
      1
    )} MCM to ${highRelease.spillMcm.toFixed(1)} MCM, while raising downstream corridor flow from ${lowRelease.downstreamAtOutletM3s.toFixed(
      0
    )} to ${highRelease.downstreamAtOutletM3s.toFixed(0)} m³/s.`;
  } else if (highRelease.deficitMcm > lowRelease.deficitMcm || highRelease.fillPct < 35) {
    tradeOffSummary = `Higher release (${highRelRate} m³/s) draws storage down to ${highRelease.fillPct.toFixed(
      1
    )}% (${highRelease.deficitMcm.toFixed(1)} MCM supply shortfall), whereas conserving water at ${lowRelRate} m³/s maintains ${lowRelease.fillPct.toFixed(
      1
    )}% fill.`;
  } else {
    tradeOffSummary = `Across ${base.days}-day operations, proposed release (${base.proposedReleaseM3s} m³/s) keeps end storage at ${baselineRelease.fillPct.toFixed(
      1
    )}% with ${baselineRelease.downstreamAtOutletM3s.toFixed(0)} m³/s downstream combined flow (±25% inflow shifts storage to ${inflowLow25.fillPct.toFixed(
      1
    )}%–${inflowHigh25.fillPct.toFixed(1)}%).`;
  }

  return {
    lowRelease,
    baselineRelease,
    highRelease,
    inflowLow25,
    inflowHigh25,
    tradeOffSummary,
  };
}
