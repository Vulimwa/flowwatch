import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  CalciteAction,
  CalciteActionBar,
  CalciteActionGroup,
  CalciteButton,
  CalciteChip,
  CalciteIcon,
  CalcitePanel,
  CalciteShell,
  CalciteShellPanel,
} from '@esri/calcite-components-react';

import { useFlowWatchState } from '../../hooks/useFlowWatchState';
import { CATCHMENT_GUIDE, GUIDED_DEMO_STEPS, MODULE_GUIDE, TOOL_GUIDE } from '../../config/voiceGuide';
import type { CatchmentGuideSection } from '../../config/voiceGuide';
import { useVoiceGuide } from '../../hooks/useVoiceGuide';
import type { AppModuleId, SupportingToolId } from '../../types/geospatial';
import { GuidedDemoController, type GuidedDemoState } from '../../services/guidedDemoController';
import { buildDownstreamRiverJourney, pointInSubBasin } from '../../utils/riverJourney';
import { ILLUSTRATIVE_DAM_PRESETS } from '../../utils/damSimulator';
import { DataQualityModule } from '../dashboards/DataQualityModule';
import {
  IndicatorProvenanceDialog,
  IndicatorRegistryPanel,
} from '../indicators/IndicatorProvenanceDialog';
import { LayerExplorer } from '../layers/LayerExplorer';
import {
  IdentifyInspector,
  LegendPanel,
  QuickTransparencyPanel,
} from '../legends/LegendPanel';
import { BasinMapView } from '../map/BasinMapView';
import { DatasetInfoDialog, HelpDialog } from '../shared/DatasetInfoDialog';
import { BasinSituationWorkspace } from '../workspaces/BasinSituationWorkspace';
import { CatchmentResponseWorkspace } from '../workspaces/CatchmentResponseWorkspace';
import { ImpactExposureWorkspace } from '../workspaces/ImpactExposureWorkspace';
import { River3DExplorerWorkspace } from '../workspaces/River3DExplorerWorkspace';
import { StreamflowWorkspace } from '../workspaces/StreamflowWorkspace';
import { WaterOperationsWorkspace } from '../workspaces/WaterOperationsWorkspace';
import { VoiceGuidePanel } from '../voice/VoiceGuidePanel';

type CalciteIconName = NonNullable<ComponentProps<typeof CalciteAction>['icon']>;

const EMPTY_DEMO_STATE: GuidedDemoState = {
  running: false,
  paused: false,
  completed: false,
  actionPending: false,
  index: 0,
  notice: null,
  narration: '',
};

const WELCOME_DISMISSED_KEY = 'flowwatch-guide-welcome-dismissed-v1';

function readWelcomePreference(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true';
  } catch (error) {
    console.warn('Unable to read the Voice Guide welcome preference.', error);
    return true;
  }
}

function persistWelcomeDismissed(): void {
  try {
    window.localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
  } catch (error) {
    console.warn('Unable to save the Voice Guide welcome preference.', error);
  }
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
  intervalMs = 200
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise<void>((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return condition();
}

const WORKSPACES: Array<{
  id: AppModuleId;
  label: string;
  shortLabel: string;
  icon: CalciteIconName;
}> = [
  { id: 'basin_situation', label: 'Basin Situation & Synthesis', shortLabel: 'Basin Situation', icon: 'home' },
  { id: 'streamflow', label: 'Streamflow Intelligence', shortLabel: 'Streamflow', icon: 'layer-stream' },
  { id: 'catchment_response', label: 'Catchment Response', shortLabel: 'Catchment', icon: 'rain' },
  { id: 'impact_exposure', label: 'Impact & Exposure Screening', shortLabel: 'Impact & Exposure', icon: 'user' },
  { id: 'water_operations', label: 'Water Operations Lab', shortLabel: 'Water Ops', icon: 'sliders-horizontal' },
  { id: 'river_3d_explorer', label: 'Tana River 3D Intelligence Explorer', shortLabel: '3D Explorer', icon: 'globe' },
];

export function AppShell() {
  const state = useFlowWatchState();
  const [leftTab, setLeftTab] = useState<'workspace' | SupportingToolId>('workspace');
  const [catchmentSection, setCatchmentSection] = useState<CatchmentGuideSection>('rainfall');
  const [demoLayerRequest, setDemoLayerRequest] = useState<{
    section: 'rainfall' | 'soil-pet';
    layerId: string;
    nonce: number;
  } | null>(null);
  const [demoPresetRequest, setDemoPresetRequest] = useState<{ id: string; nonce: number } | null>(
    null
  );
  const [demoFollowNonce, setDemoFollowNonce] = useState(0);
  const [demoState, setDemoState] = useState<GuidedDemoState>(EMPTY_DEMO_STATE);
  const [welcomeOpen, setWelcomeOpen] = useState(readWelcomePreference);
  const [controlHelpMode, setControlHelpMode] = useState(false);
  const voice = useVoiceGuide();
  const stateRef = useRef(state);
  stateRef.current = state;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const leftTabRef = useRef(leftTab);
  leftTabRef.current = leftTab;
  const catchmentSectionRef = useRef(catchmentSection);
  catchmentSectionRef.current = catchmentSection;
  const mapReadyRef = useRef(false);
  const demoLayerNonceRef = useRef(0);
  const demoPresetNonceRef = useRef(0);
  const demoSnapshotRef = useRef<{
    activeModule: AppModuleId;
    leftTab: 'workspace' | SupportingToolId;
    rightTab: typeof state.rightTab;
    rightPanelOpen: boolean;
    mapMode: '2d' | '3d';
    basemapId: string;
    selectedHybasId: number | 'all';
    selectedLinkno: number | null;
    visibleLayers: Record<string, boolean>;
    catchmentSection: CatchmentGuideSection;
    riverJourneyTarget: typeof state.riverJourneyTarget;
    riverProfileMarker: typeof state.riverProfileMarker;
  } | null>(null);
  const suppressPageNarrationRef = useRef(false);
  const lastNarratedContextRef = useRef<string | null>(null);
  const demoControllerRef = useRef<GuidedDemoController | null>(null);
  const demoActionsRef = useRef<{
    onStart: () => void;
    onStop: () => void;
    onComplete: () => void;
    onStep: (stepIndex: number) => Promise<{ narration?: string; notice?: string } | void>;
  }>({
    onStart: () => undefined,
    onStop: () => undefined,
    onComplete: () => undefined,
    onStep: async () => undefined,
  });

  const handleMapReadyChange = useCallback((ready: boolean) => {
    mapReadyRef.current = ready;
  }, []);

  // Sync Calcite light/dark mode class and ArcGIS theme CSS so all tokens & widgets match seamlessly
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('calcite-mode-dark', state.darkTheme);
    root.classList.toggle('calcite-mode-light', !state.darkTheme);
    const arcgisLink = document.getElementById('arcgis-theme-css') as HTMLLinkElement | null;
    if (arcgisLink) {
      arcgisLink.href = state.darkTheme
        ? '/arcgis-assets/esri/themes/dark/main.css'
        : '/arcgis-assets/esri/themes/light/main.css';
    }
  }, [state.darkTheme]);

  useEffect(() => {
    if (welcomeOpen) {
      state.setRightTab('guide');
      state.setRightPanelOpen(true);
    }
  }, [state.setRightPanelOpen, state.setRightTab, welcomeOpen]);

  const activeWorkspaceInfo =
    WORKSPACES.find((m) => m.id === state.activeModule) || WORKSPACES[0];

  const handleSelectWorkspace = (id: AppModuleId) => {
    state.setActiveModule(id);
    if (id === 'river_3d_explorer') state.setMapMode('3d');
    if (id === 'catchment_response') setCatchmentSection('rainfall');
    setLeftTab('workspace');
    state.setLeftPanelOpen(true);
  };

  const openGuidePanel = () => {
    state.setRightTab('guide');
    state.setRightPanelOpen(true);
  };

  const dismissWelcome = () => {
    setWelcomeOpen(false);
    persistWelcomeDismissed();
  };

  const handleOpenSupportingTool = (tool: SupportingToolId) => {
    if (state.leftPanelOpen && leftTab === tool) {
      state.setLeftPanelOpen(false);
    } else {
      setLeftTab(tool);
      state.setLeftPanelOpen(true);
    }
  };

  const activeReach =
    state.selectedLinkno !== null
      ? state.reachByLinkno.get(state.selectedLinkno) || null
      : null;

  const activeZonal =
    state.zonalStats
      ? state.selectedHybasId === 'all'
        ? state.zonalStats.basinWide
        : state.zonalStats.bySubBasin.find((b) => b.hybasId === state.selectedHybasId) ||
          state.zonalStats.basinWide
      : null;

  const currentGuideContext =
    leftTab === 'workspace'
      ? state.activeModule === 'catchment_response'
        ? CATCHMENT_GUIDE[catchmentSection]
        : MODULE_GUIDE[state.activeModule]
      : TOOL_GUIDE[leftTab];
  const visibleLayerNames = state.visibleDatasets
    .slice(0, 4)
    .map((dataset) => dataset.shortTitle);
  const currentPageNarration = [
    currentGuideContext.narration,
    activeReach
      ? `The selected verified GEOGLOWS reach is ${activeReach.displayName}, LINKNO ${activeReach.linkno}.`
      : state.selectedLinkno !== null
        ? `GEOGLOWS LINKNO ${state.selectedLinkno} is selected, but the current local verified reach record is not available.`
        : '',
    state.selectedHybasId === 'all'
      ? ''
      : `The selected study-area sub-basin is ${
          state.subBasins.find((basin) => basin.hybasId === state.selectedHybasId)?.name ??
          `HydroBASINS ${state.selectedHybasId}`
        }.`,
    `The shared map is currently in ${state.mapMode === '3d' ? 'three-dimensional SceneView' : 'two-dimensional MapView'} mode.`,
    visibleLayerNames.length > 0
      ? `Visible map layers include ${visibleLayerNames.join(', ')}${
          state.visibleDatasets.length > visibleLayerNames.length
            ? `, and ${state.visibleDatasets.length - visibleLayerNames.length} more`
            : ''
        }.`
      : 'No thematic map layer is currently visible.',
  ]
    .filter(Boolean)
    .join(' ');
  const pageContextKey = [
    state.activeModule,
    leftTab,
    catchmentSection,
    state.mapMode,
    state.selectedLinkno ?? '',
    state.selectedHybasId,
  ].join(':');

  useEffect(() => {
    voice.setNarrationText(currentPageNarration);
  }, [currentPageNarration, voice.setNarrationText]);

  useEffect(() => {
    if (suppressPageNarrationRef.current) {
      suppressPageNarrationRef.current = false;
      lastNarratedContextRef.current = pageContextKey;
      return;
    }
    if (lastNarratedContextRef.current === pageContextKey) return;
    lastNarratedContextRef.current = pageContextKey;
    if (!demoState.running && voice.enabled && voice.userActivated) {
      voice.speak(currentPageNarration);
    }
  }, [
    currentPageNarration,
    demoState.running,
    pageContextKey,
    voice.enabled,
    voice.speak,
    voice.userActivated,
  ]);

  const demoActions = {
    onStart: () => {
      const current = stateRef.current;
      demoSnapshotRef.current = {
        activeModule: current.activeModule,
        leftTab: leftTabRef.current,
        rightTab: current.rightTab,
        rightPanelOpen: current.rightPanelOpen,
        mapMode: current.mapMode,
        basemapId: current.basemapId,
        selectedHybasId: current.selectedHybasId,
        selectedLinkno: current.selectedLinkno,
        visibleLayers: Object.fromEntries(
          Object.entries(current.layersState).map(([id, layer]) => [id, layer.visible])
        ),
        catchmentSection: catchmentSectionRef.current,
        riverJourneyTarget: current.riverJourneyTarget,
        riverProfileMarker: current.riverProfileMarker,
      };
      setWelcomeOpen(false);
      persistWelcomeDismissed();
      current.setRightTab('guide');
      current.setRightPanelOpen(true);
    },
    onStop: () => {
      const snapshot = demoSnapshotRef.current;
      if (!snapshot) return;
      const current = stateRef.current;
      suppressPageNarrationRef.current = true;
      current.setActiveModule(snapshot.activeModule);
      current.setBasemapId(snapshot.basemapId);
      current.setMapMode(snapshot.mapMode);
      current.resetHomeExtent();
      current.selectHybasId(snapshot.selectedHybasId, false);
      current.selectGeoglowsReach(snapshot.selectedLinkno, false);
      current.setRiverJourneyTarget(snapshot.riverJourneyTarget);
      current.setRiverProfileMarker(snapshot.riverProfileMarker);
      Object.entries(snapshot.visibleLayers).forEach(([id, visible]) => {
        current.setLayerVisible(id, visible);
      });
      setLeftTab(snapshot.leftTab);
      setCatchmentSection(snapshot.catchmentSection);
      setDemoLayerRequest(null);
      setDemoPresetRequest(null);
      current.setRightTab(snapshot.rightTab);
      current.setRightPanelOpen(snapshot.rightPanelOpen);
      demoSnapshotRef.current = null;
    },
    onComplete: () => {
      const current = stateRef.current;
      suppressPageNarrationRef.current = true;
      demoSnapshotRef.current = null;
      current.setActiveModule('basin_situation');
      current.setMapMode('2d');
      current.resetHomeExtent();
      setLeftTab('workspace');
      setCatchmentSection('rainfall');
      setDemoLayerRequest(null);
      setDemoPresetRequest(null);
      current.setLeftPanelOpen(true);
      current.setRightTab('guide');
      current.setRightPanelOpen(true);
    },
    onStep: async (stepIndex: number) => {
      const step = GUIDED_DEMO_STEPS[stepIndex];
      const current = stateRef.current;
      handleSelectWorkspace(step.module);

      if (step.id === 'basin-question') {
        return mapReadyRef.current
          ? undefined
          : { notice: 'The map is still initializing. The overview remains available while the chapter continues.' };
      }

      if (step.id === 'rainfall-signal' || step.id === 'soil-and-demand') {
        const section = step.id === 'rainfall-signal' ? 'rainfall' : 'soil-pet';
        const layerId =
          step.id === 'rainfall-signal' ? 'chirps_anomaly_2026' : 'era5_sm_anomaly_2026';
        setCatchmentSection(section);
        setDemoLayerRequest({ section, layerId, nonce: ++demoLayerNonceRef.current });
        const loaded = await waitForCondition(() => {
          const layer = stateRef.current.layersState[layerId];
          return layer?.status === 'ready' || layer?.status === 'error';
        }, 10_000);
        const layer = stateRef.current.layersState[layerId];
        if (!loaded || layer?.status !== 'ready') {
          return {
            notice: layer?.error
              ? `The ${layerId} layer reported an error: ${layer.error}`
              : `The ${layerId} layer did not report ready within 10 seconds. Check its map status; the chapter will continue with the text explanation.`,
          };
        }
        return undefined;
      }

      if (step.id === 'river-signal') {
        const app = stateRef.current;
        const reach =
          (app.selectedLinkno !== null && app.reachByLinkno.get(app.selectedLinkno)) ||
          app.geoglowsIndex?.reaches.find((candidate) => candidate.matchedFids.length > 0) ||
          null;
        if (reach && reach.linkno !== app.selectedLinkno) {
          app.selectGeoglowsReach(reach.linkno, true);
        }
        const responseReady = await waitForCondition(
          () => Boolean(stateRef.current.streamflowAnalysis),
          7_000
        );
        return {
          narration: reach
            ? `${step.narration} The selected local match is ${reach.displayName}, LINKNO ${reach.linkno}.`
            : step.narration,
          notice: !reach
            ? 'No locally verified GEOGLOWS reach is available for this chapter.'
            : responseReady
              ? undefined
              : 'No streamflow analysis response was ready within 7 seconds. The forecast workspace displays the service loading or error status; continue without inferring missing values.',
        };
      }

      if (step.id === 'terrain-and-network') {
        const app = stateRef.current;
        app.setMapMode('3d');
        app.selectHybasId('all', false);
        app.setRiverJourneyTarget(null);
        app.setRiverProfileMarker(null);
        const infrastructureReady = await waitForCondition(
          () =>
            !stateRef.current.geoglowsIndexLoading &&
            !stateRef.current.subBasinsLoading,
          10_000
        );
        const latest = stateRef.current;
        const studyAreaReaches =
          latest.geoglowsIndex && latest.subBasins.length > 0
            ? latest.geoglowsIndex.reaches.filter((reach) =>
                latest.subBasins.some((basin) =>
                  pointInSubBasin(reach.centroid[0], reach.centroid[1], basin)
                )
              )
            : [];
        const verifiedStarts = studyAreaReaches
          .filter((reach) => reach.matchedFids.length > 0)
          .sort((a, b) => a.upstreamAreaKm2 - b.upstreamAreaKm2);
        const connectedStart = verifiedStarts.find(
          (reach) =>
            buildDownstreamRiverJourney(reach.linkno, studyAreaReaches)
              .downstreamDirectionVerified
        );
        const selectedStart = connectedStart ?? verifiedStarts[0] ?? null;
        if (selectedStart) {
          latest.selectGeoglowsReach(selectedStart.linkno, true);
          if (connectedStart) setDemoFollowNonce((nonce) => nonce + 1);
        }
        const mapReady = await waitForCondition(() => mapReadyRef.current, 12_000);
        const notice = !infrastructureReady
          ? 'The local river index or sub-basin service did not finish loading within 10 seconds.'
          : !selectedStart
            ? 'No locally verified river reach is available in the study-area polygons.'
            : !connectedStart
              ? 'No unambiguous downstream geometry connection was verified for the available local reaches. The explorer will show the reach profile without claiming a continuous route.'
              : !mapReady
                ? 'The 3D scene is still initializing; the chapter continues with its text explanation.'
                : undefined;
        return {
          narration: selectedStart
            ? `${step.narration} The selected local reach is ${selectedStart.displayName}, LINKNO ${selectedStart.linkno}.`
            : step.narration,
          notice,
        };
      }

      if (step.id === 'exposure-screen') {
        const app = stateRef.current;
        app.setLayerVisible('population_2025', true);
        app.setLayerVisible('builtup_2020', true);
        app.setLayerVisible('hand', true);
        if (app.selectedLinkno === null) {
          return { notice: 'A locally verified river reach is required for the corridor screening; no reach is currently selected.' };
        }
        const screeningReady = await waitForCondition(() => {
          const latest = stateRef.current;
          return Boolean(
            latest.exposureError ||
              (latest.exposureScreening?.linkno === latest.selectedLinkno &&
                latest.exposureScreening.bufferMeters === latest.exposureBufferMeters)
          );
        }, 8_000);
        return screeningReady
          ? stateRef.current.exposureError
            ? { notice: `Exposure screening reported an error: ${stateRef.current.exposureError}` }
            : undefined
          : {
              notice: 'Exposure screening did not return a result within 8 seconds. The workspace remains available and will show its current loading or error status.',
            };
      }

      if (step.id === 'operations-scenario') {
        const preset = ILLUSTRATIVE_DAM_PRESETS.find(
          (candidate) => candidate.id === 'dry-spell-conservation'
        );
        setDemoPresetRequest({
          id: preset?.id ?? 'dry-spell-conservation',
          nonce: ++demoPresetNonceRef.current,
        });
        return {
          narration: preset
            ? `${step.narration} The selected illustrative preset is ${preset.label}.`
            : step.narration,
        };
      }

      return undefined;
    },
  };
  demoActionsRef.current = demoActions;

  if (!demoControllerRef.current) {
    demoControllerRef.current = new GuidedDemoController({
      onStateChange: setDemoState,
      onStart: () => demoActionsRef.current.onStart(),
      onStop: () => demoActionsRef.current.onStop(),
      onComplete: () => demoActionsRef.current.onComplete(),
      onStep: async (_step, index) => demoActionsRef.current.onStep(index),
      speak: (text) => voiceRef.current.speak(text),
      isSpeechActive: () =>
        voiceRef.current.status === 'speaking' || voiceRef.current.status === 'paused',
      isSpeechPaused: () => voiceRef.current.status === 'paused',
      cancelSpeech: () => voiceRef.current.cancel(),
      pauseSpeech: () => voiceRef.current.pause(),
      resumeSpeech: () => voiceRef.current.resume(),
    });
  }

  useEffect(
    () => () => {
      demoControllerRef.current?.dispose();
    },
    []
  );

  const visibilityPausedDemoRef = useRef(false);
  useEffect(() => {
    const handleVisibilityChange = () => {
      const controller = demoControllerRef.current;
      if (
        document.visibilityState === 'hidden' &&
        controller?.getState().running &&
        !controller.getState().paused
      ) {
        visibilityPausedDemoRef.current = true;
        controller.pause();
      } else if (
        document.visibilityState === 'visible' &&
        visibilityPausedDemoRef.current
      ) {
        visibilityPausedDemoRef.current = false;
        controller?.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleStartDemo = () => {
    voice.activate();
    openGuidePanel();
    demoControllerRef.current?.start();
  };

  const handleExplainPage = () => {
    voice.activate();
    voice.speak(currentPageNarration);
  };

  const handleExplainControlClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!controlHelpMode || !voice.enabled || demoState.running) return;
    const hintedControl = event.nativeEvent
      .composedPath()
      .find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && Boolean(element.dataset.voiceHint)
      );
    const hint = hintedControl?.dataset.voiceHint;
    if (hint) voice.speak(hint);
  };

  const leftPanelHeading =
    leftTab === 'layers'
      ? 'Map Layer Explorer'
      : leftTab === 'registry'
      ? 'Data Quality Registry'
      : leftTab === 'indicators'
      ? 'Indicator Methodology Registry'
      : activeWorkspaceInfo.label;

  const leftPanelDescription =
    leftTab === 'layers'
      ? 'Toggle and inspect map layers'
      : leftTab === 'registry'
      ? 'Native spatial resolution, format & status across all datasets'
      : leftTab === 'indicators'
      ? 'Formulas, validity rules & scientific caveats'
      : 'Upper Tana Basin Hydrological Intelligence';

  const renderActiveWorkspace = () => {
    switch (state.activeModule) {
      case 'basin_situation':
        return (
          <BasinSituationWorkspace
            subBasins={state.subBasins}
            selectedHybasId={state.selectedHybasId}
            onSelectHybasId={state.selectHybasId}
            zonalStats={state.zonalStats}
            zonalLoading={state.zonalLoading}
            ensoStatus={state.ensoStatus}
            ensoLoading={state.ensoLoading}
            geoglowsIndex={state.geoglowsIndex}
            selectedLinkno={state.selectedLinkno}
            selectedReach={activeReach}
            onSelectGeoglowsReach={state.selectGeoglowsReach}
            streamflowAnalysis={state.streamflowAnalysis}
            exposureScreening={state.exposureScreening}
            damResult={state.damResult}
            layersState={state.layersState}
            onActivateLayer={state.activateExclusiveModuleLayer}
            onToggleLayer={state.setLayerVisible}
            onNavigateWorkspace={handleSelectWorkspace}
            onOpenSupportingTool={(tool) => {
              setLeftTab(tool);
              state.setLeftPanelOpen(true);
            }}
            onOpenIndicatorInfo={state.setActiveIndicatorId}
            onStartGuidedDemo={handleStartDemo}
          />
        );
      case 'streamflow':
        return (
          <StreamflowWorkspace
            layersState={state.layersState}
            streamsMeta={state.metadataById['tana_river_streams']}
            geoglowsMapMeta={state.geoglowsMapMeta}
            geoglowsForecastTimeMs={state.geoglowsForecastTimeMs}
            onChangeGeoglowsTimeMs={state.setGeoglowsForecastTimeMs}
            geoglowsIndex={state.geoglowsIndex}
            geoglowsIndexLoading={state.geoglowsIndexLoading}
            geoglowsIndexError={state.geoglowsIndexError}
            onReloadGeoglowsIndex={() => void state.reloadGeoglowsInfrastructure(true)}
            selectedStreamFid={state.selectedStreamFid}
            selectedLinkno={state.selectedLinkno}
            selectedTanaMatch={state.selectedTanaMatch}
            geoglowsUnverifiedMsg={state.geoglowsUnverifiedMsg}
            onSelectGeoglowsReach={state.selectGeoglowsReach}
            onSelectLocalStream={state.selectLocalStreamFid}
            onZoomToGeoglowsReach={state.zoomToGeoglowsReach}
            onToggleLayer={state.setLayerVisible}
            onActivateRaster={state.activateExclusiveModuleLayer}
            onNavigateWorkspace={handleSelectWorkspace}
            onOpenIndicatorInfo={state.setActiveIndicatorId}
            onAnalysisLoaded={state.setStreamflowAnalysis}
          />
        );
      case 'catchment_response':
        return (
          <CatchmentResponseWorkspace
            layersState={state.layersState}
            onActivateLayer={state.activateExclusiveModuleLayer}
            onChangeBand={state.setLayerBand}
            subBasins={state.subBasins}
            selectedHybasId={state.selectedHybasId}
            onSelectHybasId={state.selectHybasId}
            zonalStats={state.zonalStats}
            zonalLoading={state.zonalLoading}
            zonalStatsError={state.zonalStatsError}
            selectedReach={activeReach}
            streamflowAnalysis={state.streamflowAnalysis}
            onOpenIndicatorInfo={state.setActiveIndicatorId}
            onNavigateWorkspace={handleSelectWorkspace}
            section={catchmentSection}
            onSectionChange={setCatchmentSection}
            demoLayerRequest={demoLayerRequest}
          />
        );
      case 'impact_exposure':
        return (
          <ImpactExposureWorkspace
            selectedLinkno={state.selectedLinkno}
            selectedReach={activeReach}
            bufferMeters={state.exposureBufferMeters}
            onChangeBufferMeters={state.setExposureBufferMeters}
            screening={state.exposureScreening}
            screeningLoading={state.exposureLoading}
            screeningError={state.exposureError}
            onRunScreening={() => void state.runExposureScreening()}
            onZoomToReach={state.zoomToGeoglowsReach}
            onZoomToCoord={state.zoomToCoord}
            layersState={state.layersState}
            onActivateLayer={state.activateExclusiveModuleLayer}
            onToggleLayer={state.setLayerVisible}
            onOpenIndicatorInfo={state.setActiveIndicatorId}
            onNavigateWorkspace={handleSelectWorkspace}
            streamflowAnalysis={state.streamflowAnalysis}
            activeZonal={activeZonal}
          />
        );
      case 'water_operations':
        return (
          <WaterOperationsWorkspace
            geoglowsIndex={state.geoglowsIndex}
            selectedLinkno={state.selectedLinkno}
            onScenarioResultChange={state.setDamResult}
            onOpenIndicatorInfo={state.setActiveIndicatorId}
            demoPresetRequest={demoPresetRequest}
          />
        );
      case 'river_3d_explorer':
        return (
          <River3DExplorerWorkspace
            subBasins={state.subBasins}
            subBasinsLoading={state.subBasinsLoading}
            subBasinsError={state.subBasinsError}
            onReloadSubBasins={state.reloadSubBasins}
            selectedHybasId={state.selectedHybasId}
            onSelectHybasId={state.selectHybasId}
            geoglowsIndex={state.geoglowsIndex}
            geoglowsIndexLoading={state.geoglowsIndexLoading}
            geoglowsIndexError={state.geoglowsIndexError}
            selectedLinkno={state.selectedLinkno}
            mapMode={state.mapMode}
            onMapModeChange={state.setMapMode}
            onSelectGeoglowsReach={state.selectGeoglowsReach}
            onResetHome={state.resetHomeExtent}
            onJourneyTargetChange={state.setRiverJourneyTarget}
            onProfileMarkerChange={state.setRiverProfileMarker}
            geoglowsForecastTimeMs={state.geoglowsForecastTimeMs}
            onChangeGeoglowsTimeMs={state.setGeoglowsForecastTimeMs}
            onNavigateWorkspace={handleSelectWorkspace}
            demoFollowNonce={demoFollowNonce}
            demoRunning={demoState.running}
            demoPaused={demoState.paused}
          />
        );
      default:
        return null;
    }
  };

  return (
    <CalciteShell
      className="flowwatch-shell"
      contentBehind={false}
      data-demo-focus={
        demoState.running ? GUIDED_DEMO_STEPS[demoState.index]?.focus : undefined
      }
      onClickCapture={handleExplainControlClick}
    >
      <header slot="header" className="flowwatch-brandbar">
        <CalciteIcon icon="water-drop" scale="m" aria-hidden="true" />
        <div className="flowwatch-brand-copy">
          <strong>FlowWatch Africa</strong>
          <span>Upper Tana River Basin</span>
        </div>
        <div className="flowwatch-brand-actions">
          {demoState.running && (
            <CalciteChip scale="s" kind="brand" icon="play">
              {demoState.paused ? 'Demo paused' : 'Guided demo'}
            </CalciteChip>
          )}
          <CalciteButton
            scale="s"
            appearance="outline"
            iconStart="speech-bubble"
            onClick={openGuidePanel}
          >
            Voice Guide
          </CalciteButton>
          <CalciteButton
            scale="s"
            kind="brand"
            iconStart="play"
            disabled={demoState.running}
            onClick={handleStartDemo}
          >
            {demoState.completed ? 'Replay Demo' : 'Guided Demo'}
          </CalciteButton>
        </div>
      </header>

      <CalciteShellPanel
        className="flowwatch-shell-panel"
        slot="panel-start"
        position="start"
        displayMode="dock"
        widthScale={
          leftTab === 'workspace' &&
          (state.activeModule === 'streamflow' ||
            state.activeModule === 'basin_situation' ||
            state.activeModule === 'river_3d_explorer')
            ? 'l'
            : 'm'
        }
        collapsed={!state.leftPanelOpen}
      >
        <CalciteActionBar
          className="flowwatch-actionbar"
          slot="action-bar"
          expandToggleDisabled
          overflowMode="none"
          layout="vertical"
          scale="m"
        >
          <CalciteActionGroup data-demo-target="workspace-navigation">
            {WORKSPACES.map((m) => (
              <CalciteAction
                key={m.id}
                text={m.label}
                icon={m.icon}
                data-voice-hint={`Open the ${m.shortLabel} workspace to inspect its data and analysis controls.`}
                active={
                  state.leftPanelOpen && leftTab === 'workspace' && state.activeModule === m.id
                }
                onClick={() => {
                  if (
                    state.leftPanelOpen &&
                    leftTab === 'workspace' &&
                    state.activeModule === m.id
                  ) {
                    state.setLeftPanelOpen(false);
                  } else {
                    handleSelectWorkspace(m.id);
                  }
                }}
              />
            ))}
          </CalciteActionGroup>

          <CalciteActionGroup>
            <CalciteAction
              text="Layers"
              icon="layers"
              data-voice-hint="Open the layer explorer to turn map datasets on or off and inspect their loading status."
              active={state.leftPanelOpen && leftTab === 'layers'}
              onClick={() => handleOpenSupportingTool('layers')}
            />
            <CalciteAction
              text="Registry"
              icon="table"
              data-voice-hint="Open the data quality registry to review sources, dates, units and limitations."
              active={state.leftPanelOpen && leftTab === 'registry'}
              onClick={() => handleOpenSupportingTool('registry')}
            />
            <CalciteAction
              text="Indicators"
              icon="book"
              data-voice-hint="Open the indicator registry to review definitions, assumptions and scientific caveats."
              active={state.leftPanelOpen && leftTab === 'indicators'}
              onClick={() => handleOpenSupportingTool('indicators')}
            />
          </CalciteActionGroup>
          <CalciteActionGroup>
            <CalciteAction
              text={state.darkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              icon={state.darkTheme ? 'brightness' : 'moon'}
              onClick={() => state.setDarkTheme(!state.darkTheme)}
            />
            <CalciteAction
              text="Methodology and caveats"
              icon="question"
              onClick={() => state.setHelpDialogOpen(true)}
            />
          </CalciteActionGroup>
        </CalciteActionBar>

        <CalcitePanel
          heading={leftPanelHeading}
          description={leftPanelDescription}
          closable
          onCalcitePanelClose={() => state.setLeftPanelOpen(false)}
        >
          <div className="flowwatch-panel-content">
            {leftTab === 'layers' ? (
              <LayerExplorer
                layersState={state.layersState}
                metadataById={state.metadataById}
                mapLayersEnabled={state.mapLayersEnabled}
                onToggleMapLayersEnabled={state.setMapLayersEnabled}
                onClearAllLayers={state.clearAllLayers}
                geoglowsMapMeta={state.geoglowsMapMeta}
                geoglowsForecastTimeMs={state.geoglowsForecastTimeMs}
                onChangeGeoglowsTimeMs={state.setGeoglowsForecastTimeMs}
                onToggleVisible={state.setLayerVisible}
                onChangeOpacity={state.setLayerOpacity}
                onChangeBand={state.setLayerBand}
                onMoveOrder={state.moveLayerOrder}
                onZoomToLayer={state.zoomToLayer}
                onOpenDatasetInfo={state.setInfoModalDatasetId}
              />
            ) : leftTab === 'registry' ? (
              <DataQualityModule
                metadataById={state.metadataById}
                onOpenDatasetInfo={state.setInfoModalDatasetId}
                onActivateLayer={(id) => state.activateExclusiveModuleLayer(id)}
              />
            ) : leftTab === 'indicators' ? (
              <IndicatorRegistryPanel onSelectIndicator={state.setActiveIndicatorId} />
            ) : (
              renderActiveWorkspace()
            )}
          </div>
        </CalcitePanel>
      </CalciteShellPanel>

      {/* Central Map / 3D Terrain Workspace */}
      <main className="flowwatch-map-main">
        <BasinMapView
          activeModule={state.activeModule}
          basemapId={state.basemapId}
          onBasemapChange={state.setBasemapId}
          viewMode={state.mapMode}
          onViewModeChange={state.setMapMode}
          terrainExaggeration={state.terrainExaggeration}
          onTerrainExaggerationChange={state.setTerrainExaggeration}
          mapLayersEnabled={state.mapLayersEnabled}
          onMapLayersEnabledChange={state.setMapLayersEnabled}
          darkTheme={state.darkTheme}
          journeyTarget={state.riverJourneyTarget}
          profileMarker={state.riverProfileMarker}
          layersState={state.layersState}
          subBasins={state.subBasins}
          selectedHybasId={state.selectedHybasId}
          selectedStreamFid={state.selectedStreamFid}
          selectedLinkno={state.selectedLinkno}
          reachByLinkno={state.reachByLinkno}
          tanaMatchByFid={state.tanaMatchByFid}
          geoglowsForecastTimeMs={state.geoglowsForecastTimeMs}
          exposureBufferMeters={state.exposureBufferMeters}
          exposureScreening={state.exposureScreening}
          onSelectStreamFid={state.setSelectedStreamFid}
          onIdentifyReachSelection={state.applyIdentifyReachSelection}
          zoomTarget={state.zoomTarget}
          onResetHome={state.resetHomeExtent}
          onIdentifyStart={() => state.setIdentifying(true)}
          onIdentifyComplete={(res) => {
            state.setIdentifyResult(res);
            state.setIdentifying(false);
          }}
          onOpenIdentifyTab={() => {
            state.setRightTab('identify');
            state.setRightPanelOpen(true);
          }}
          onMapReadyChange={handleMapReadyChange}
        />
      </main>

      {/* Right Collapsible Shell Panel */}
      <CalciteShellPanel
        className="flowwatch-shell-panel"
        slot="panel-end"
        position="end"
        displayMode="dock"
        widthScale="s"
        collapsed={!state.rightPanelOpen}
      >
        <CalciteActionBar
          className="flowwatch-actionbar"
          slot="action-bar"
          expandToggleDisabled
          overflowMode="none"
          layout="vertical"
          scale="m"
        >
          <CalciteActionGroup>
            <CalciteAction
              text="Legend"
              icon="legend"
              active={state.rightPanelOpen && state.rightTab === 'legend'}
              onClick={() => {
                if (state.rightPanelOpen && state.rightTab === 'legend') {
                  state.setRightPanelOpen(false);
                } else {
                  state.setRightTab('legend');
                  state.setRightPanelOpen(true);
                }
              }}
            />
            <CalciteAction
              text="Identify"
              icon="cursor-click"
              active={state.rightPanelOpen && state.rightTab === 'identify'}
              onClick={() => {
                if (state.rightPanelOpen && state.rightTab === 'identify') {
                  state.setRightPanelOpen(false);
                } else {
                  state.setRightTab('identify');
                  state.setRightPanelOpen(true);
                }
              }}
            />
            <CalciteAction
              text="Provenance"
              icon="information"
              active={state.rightPanelOpen && state.rightTab === 'transparency'}
              onClick={() => {
                if (state.rightPanelOpen && state.rightTab === 'transparency') {
                  state.setRightPanelOpen(false);
                } else {
                  state.setRightTab('transparency');
                  state.setRightPanelOpen(true);
                }
              }}
            />
            <CalciteAction
              text="Voice Guide & Demo"
              icon="speech-bubble"
              active={state.rightPanelOpen && state.rightTab === 'guide'}
              onClick={openGuidePanel}
            />
          </CalciteActionGroup>
        </CalciteActionBar>

        <CalcitePanel
          heading={
            state.rightTab === 'legend'
              ? 'Active Map Legends'
              : state.rightTab === 'identify'
              ? 'Map Pixel & Stream Identify'
              : state.rightTab === 'transparency'
                ? 'Active Layer Provenance'
                : 'Voice Guide & Guided Demo'
          }
          closable
          onCalcitePanelClose={() => state.setRightPanelOpen(false)}
        >
          <div className="flowwatch-panel-content">
            {state.rightTab === 'legend' && (
              <LegendPanel
                visibleDatasets={state.visibleDatasets}
                layersState={state.layersState}
                geoglowsMapMeta={state.geoglowsMapMeta}
                geoglowsForecastTimeMs={state.geoglowsForecastTimeMs}
                onOpenDatasetInfo={state.setInfoModalDatasetId}
              />
            )}
            {state.rightTab === 'identify' && (
              <IdentifyInspector
                identifyResult={state.identifyResult}
                identifying={state.identifying}
                onZoomToStream={state.zoomToStreamFeature}
                onZoomToGeoglowsReach={state.zoomToGeoglowsReach}
                onInspectInRivers={(linkno) => {
                  state.selectGeoglowsReach(linkno, true);
                  handleSelectWorkspace('streamflow');
                }}
              />
            )}
            {state.rightTab === 'transparency' && (
              <QuickTransparencyPanel
                visibleDatasets={state.visibleDatasets}
                metadataById={state.metadataById}
                onOpenDatasetInfo={state.setInfoModalDatasetId}
                onOpenRegistryModule={() => {
                  setLeftTab('registry');
                  state.setLeftPanelOpen(true);
                }}
              />
            )}
            {state.rightTab === 'guide' && (
              <VoiceGuidePanel
                voice={voice}
                pageTitle={currentGuideContext.title}
                pageNarration={currentPageNarration}
                welcomeOpen={welcomeOpen}
                onDismissWelcome={() => {
                  dismissWelcome();
                  state.setRightPanelOpen(false);
                }}
                onStartDemo={handleStartDemo}
                onExplainPage={handleExplainPage}
                onPauseSpeech={() => {
                  if (demoState.running) demoControllerRef.current?.pause();
                  else voice.pause();
                }}
                onResumeSpeech={() => {
                  if (demoState.running) demoControllerRef.current?.resume();
                  else voice.resume();
                }}
                controlHelpMode={controlHelpMode}
                onToggleControlHelp={() => setControlHelpMode((enabled) => !enabled)}
                demoState={demoState}
                onPauseDemo={() => demoControllerRef.current?.pause()}
                onResumeDemo={() => demoControllerRef.current?.resume()}
                onPreviousDemoStep={() => demoControllerRef.current?.previous()}
                onNextDemoStep={() => demoControllerRef.current?.next()}
                onRestartDemo={() => demoControllerRef.current?.restart()}
                onStopDemo={() => demoControllerRef.current?.stop()}
                onReplayDemo={() => {
                  demoControllerRef.current?.dismissCompleted();
                  handleStartDemo();
                }}
                onExploreIndependently={() => {
                  dismissWelcome();
                  demoControllerRef.current?.dismissCompleted();
                  state.setRightPanelOpen(false);
                }}
              />
            )}
          </div>
        </CalcitePanel>
      </CalciteShellPanel>

      <DatasetInfoDialog
        datasetId={state.infoModalDatasetId}
        metadataById={state.metadataById}
        layersState={state.layersState}
        onClose={() => state.setInfoModalDatasetId(null)}
      />

      <IndicatorProvenanceDialog
        indicatorId={state.activeIndicatorId}
        onClose={() => state.setActiveIndicatorId(null)}
      />

      <HelpDialog
        open={state.helpDialogOpen}
        onClose={() => state.setHelpDialogOpen(false)}
      />
    </CalciteShell>
  );
}
