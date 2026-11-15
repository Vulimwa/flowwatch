import { useEffect, useState, type ComponentProps } from 'react';
import {
  CalciteAction,
  CalciteActionBar,
  CalciteActionGroup,
  CalciteIcon,
  CalcitePanel,
  CalciteShell,
  CalciteShellPanel,
} from '@esri/calcite-components-react';

import { useFlowWatchState } from '../../hooks/useFlowWatchState';
import type { AppModuleId, SupportingToolId } from '../../types/geospatial';
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
import { StreamflowWorkspace } from '../workspaces/StreamflowWorkspace';
import { WaterOperationsWorkspace } from '../workspaces/WaterOperationsWorkspace';

type CalciteIconName = NonNullable<ComponentProps<typeof CalciteAction>['icon']>;

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
];

export function AppShell() {
  const state = useFlowWatchState();
  const [leftTab, setLeftTab] = useState<'workspace' | SupportingToolId>('workspace');

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

  const activeWorkspaceInfo =
    WORKSPACES.find((m) => m.id === state.activeModule) || WORKSPACES[0];

  const handleSelectWorkspace = (id: AppModuleId) => {
    state.setActiveModule(id);
    setLeftTab('workspace');
    state.setLeftPanelOpen(true);
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
            selectedReach={activeReach}
            streamflowAnalysis={state.streamflowAnalysis}
            onOpenIndicatorInfo={state.setActiveIndicatorId}
            onNavigateWorkspace={handleSelectWorkspace}
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
          />
        );
      default:
        return null;
    }
  };

  return (
    <CalciteShell className="flowwatch-shell" contentBehind={false}>
      <header slot="header" className="flowwatch-brandbar">
        <CalciteIcon icon="water-drop" scale="m" aria-hidden="true" />
        <div className="flowwatch-brand-copy">
          <strong>FlowWatch Africa</strong>
          <span>Upper Tana River Basin</span>
        </div>
      </header>

      <CalciteShellPanel
        className="flowwatch-shell-panel"
        slot="panel-start"
        position="start"
        displayMode="dock"
        widthScale={
          leftTab === 'workspace' &&
          (state.activeModule === 'streamflow' || state.activeModule === 'basin_situation')
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
          <CalciteActionGroup>
            {WORKSPACES.map((m) => (
              <CalciteAction
                key={m.id}
                text={m.label}
                icon={m.icon}
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
              active={state.leftPanelOpen && leftTab === 'layers'}
              onClick={() => handleOpenSupportingTool('layers')}
            />
            <CalciteAction
              text="Registry"
              icon="table"
              active={state.leftPanelOpen && leftTab === 'registry'}
              onClick={() => handleOpenSupportingTool('registry')}
            />
            <CalciteAction
              text="Indicators"
              icon="book"
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
          </CalciteActionGroup>
        </CalciteActionBar>

        <CalcitePanel
          heading={
            state.rightTab === 'legend'
              ? 'Active Map Legends'
              : state.rightTab === 'identify'
              ? 'Map Pixel & Stream Identify'
              : 'Active Layer Provenance'
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
