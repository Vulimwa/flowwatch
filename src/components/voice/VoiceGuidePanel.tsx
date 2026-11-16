import {
  CalciteButton,
  CalciteLabel,
  CalciteNotice,
  CalciteOption,
  CalciteSelect,
} from '@esri/calcite-components-react';

import type { GuidedDemoState } from '../../services/guidedDemoController';
import { useVoiceGuide } from '../../hooks/useVoiceGuide';
import { GuidedDemoPanel } from '../demo/GuidedDemoPanel';

interface VoiceGuidePanelProps {
  voice: ReturnType<typeof useVoiceGuide>;
  pageTitle: string;
  pageNarration: string;
  welcomeOpen: boolean;
  onDismissWelcome: () => void;
  onStartDemo: () => void;
  onExplainPage: () => void;
  onPauseSpeech: () => void;
  onResumeSpeech: () => void;
  controlHelpMode: boolean;
  onToggleControlHelp: () => void;
  demoState: GuidedDemoState;
  onPauseDemo: () => void;
  onResumeDemo: () => void;
  onPreviousDemoStep: () => void;
  onNextDemoStep: () => void;
  onRestartDemo: () => void;
  onStopDemo: () => void;
  onReplayDemo: () => void;
  onExploreIndependently: () => void;
}

export function VoiceGuidePanel({
  voice,
  pageTitle,
  pageNarration,
  welcomeOpen,
  onDismissWelcome,
  onStartDemo,
  onExplainPage,
  onPauseSpeech,
  onResumeSpeech,
  controlHelpMode,
  onToggleControlHelp,
  demoState,
  onPauseDemo,
  onResumeDemo,
  onPreviousDemoStep,
  onNextDemoStep,
  onRestartDemo,
  onStopDemo,
  onReplayDemo,
  onExploreIndependently,
}: VoiceGuidePanelProps) {
  const canSpeak = voice.supported && voice.enabled && voice.userActivated;

  return (
    <div className="flowwatch-guide-panel flex flex-col gap-3 p-3">
      {welcomeOpen && (
        <CalciteNotice open icon="information">
          <div slot="title">Welcome to FlowWatch Africa</div>
          <div slot="message">
            Explore Upper Tana climate, catchment response, modelled river signals and exposure context.
            The guided demo walks through seven chapters using the existing map and workspaces. Voice
            playback is optional; readable narration remains available.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <CalciteButton
              scale="s"
              kind="brand"
              iconStart="speech-bubble"
              disabled={!voice.supported}
              onClick={() => {
                voice.activate();
                if (!voice.enabled) voice.toggleEnabled();
              }}
            >
              Enable Voice Guide
            </CalciteButton>
            <CalciteButton
              scale="s"
              appearance="outline"
              iconStart="play"
              onClick={onStartDemo}
            >
              Start Guided Demo
            </CalciteButton>
            <CalciteButton
              scale="s"
              appearance="outline"
              onClick={onDismissWelcome}
            >
              Explore Independently
            </CalciteButton>
          </div>
        </CalciteNotice>
      )}

      <section className="flowwatch-guide-section">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Voice Guide</div>
            <div className="text-xs text-[var(--calcite-color-text-3)]">
              Current view: {pageTitle}
            </div>
          </div>
          <CalciteButton
            scale="s"
            appearance={voice.enabled ? 'solid' : 'outline'}
            kind={voice.enabled ? 'brand' : 'neutral'}
            iconStart="speech-bubble"
            disabled={!voice.supported || demoState.running}
            onClick={() => {
              voice.activate();
              if (!voice.enabled || voice.userActivated) voice.toggleEnabled();
            }}
          >
            {voice.enabled
              ? voice.userActivated
                ? 'Voice On'
                : 'Activate Voice'
              : 'Enable Voice'}
          </CalciteButton>
        </div>

        {!voice.supported && (
          <CalciteNotice open icon="information" scale="s">
            <div slot="message">
              Speech synthesis is not available in this browser. You can still read the complete
              narration below and use every guided-demo control.
            </div>
          </CalciteNotice>
        )}

        <CalciteLabel scale="s">
          Voice
          <CalciteSelect
            scale="s"
            label="Voice"
            value={voice.voiceName}
            disabled={!voice.supported}
            onCalciteSelectChange={(event) =>
              voice.setVoiceName(String((event.target as HTMLCalciteSelectElement).value))
            }
          >
            <CalciteOption value="">System default</CalciteOption>
            {voice.voices.map((availableVoice) => (
              <CalciteOption key={`${availableVoice.name}-${availableVoice.lang}`} value={availableVoice.name}>
                {availableVoice.name} ({availableVoice.lang})
              </CalciteOption>
            ))}
          </CalciteSelect>
        </CalciteLabel>

        <CalciteLabel scale="s">
          Speech rate
          <CalciteSelect
            scale="s"
            label="Speech rate"
            value={String(voice.rate)}
            disabled={!voice.supported}
            onCalciteSelectChange={(event) =>
              voice.setRate(Number((event.target as HTMLCalciteSelectElement).value))
            }
          >
            <CalciteOption value="0.8">Slow</CalciteOption>
            <CalciteOption value="1">Normal</CalciteOption>
            <CalciteOption value="1.2">Fast</CalciteOption>
            <CalciteOption value="1.4">Faster</CalciteOption>
          </CalciteSelect>
        </CalciteLabel>

        <div className="flex flex-wrap gap-2">
          <CalciteButton
            scale="s"
            kind="brand"
            iconStart="play"
            disabled={!voice.supported || !voice.enabled || !voice.narrationText || demoState.running}
            onClick={onExplainPage}
          >
            Explain This View
          </CalciteButton>
          <CalciteButton
            scale="s"
            appearance="outline"
            iconStart="reset"
            disabled={!canSpeak || !voice.narrationText || demoState.running}
            onClick={voice.repeat}
          >
            Repeat
          </CalciteButton>
          {voice.status === 'speaking' ? (
            <CalciteButton
              scale="s"
              appearance="outline"
              iconStart="pause"
              onClick={onPauseSpeech}
            >
              Pause
            </CalciteButton>
          ) : voice.status === 'paused' ? (
            <CalciteButton
              scale="s"
              appearance="outline"
              iconStart="play"
              onClick={onResumeSpeech}
            >
              Resume
            </CalciteButton>
          ) : null}
          <CalciteButton
            scale="s"
            appearance="outline"
            iconStart="stop"
            disabled={!voice.supported || voice.status === 'idle' || demoState.running}
            onClick={voice.cancel}
          >
            Stop
          </CalciteButton>
        </div>

        <CalciteButton
          className="mt-2"
          scale="s"
          appearance={controlHelpMode ? 'solid' : 'outline'}
          kind={controlHelpMode ? 'brand' : 'neutral'}
          iconStart="information"
          onClick={onToggleControlHelp}
        >
          {controlHelpMode ? 'Control help on' : 'Explain controls when selected'}
        </CalciteButton>

        <div className="flowwatch-narration-copy mt-2" aria-live="polite">
          <div className="mb-1 text-xs font-semibold">Readable narration</div>
          <p className="m-0 text-xs leading-relaxed">{pageNarration}</p>
        </div>

        <div className="mt-2 text-xs text-[var(--calcite-color-text-3)]" aria-live="polite">
          {voice.status === 'speaking'
            ? 'Speaking'
            : voice.status === 'paused'
              ? 'Speech paused'
              : voice.enabled && !voice.userActivated
                ? 'Select Voice On or Start Guided Demo to enable speech for this session.'
                : !voice.enabled
                  ? 'Voice is off; the complete narration remains available as text.'
                : 'Speech is idle'}
        </div>
        {voice.error && (
          <CalciteNotice open icon="exclamation-mark-triangle" scale="s">
            <div slot="message">{voice.error}</div>
          </CalciteNotice>
        )}
      </section>

      <GuidedDemoPanel
        state={demoState}
        onStart={onStartDemo}
        onPause={onPauseDemo}
        onResume={onResumeDemo}
        onPrevious={onPreviousDemoStep}
        onNext={onNextDemoStep}
        onRestart={onRestartDemo}
        onStop={onStopDemo}
        onReplay={onReplayDemo}
        onExploreIndependently={onExploreIndependently}
      />
    </div>
  );
}
