import {
  CalciteButton,
  CalciteNotice,
  CalciteProgress,
} from '@esri/calcite-components-react';

import {
  GUIDED_DEMO_STEPS,
} from '../../config/voiceGuide';
import type { GuidedDemoState } from '../../services/guidedDemoController';

interface GuidedDemoPanelProps {
  state: GuidedDemoState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRestart: () => void;
  onStop: () => void;
  onReplay: () => void;
  onExploreIndependently: () => void;
}

export function GuidedDemoPanel({
  state,
  onStart,
  onPause,
  onResume,
  onPrevious,
  onNext,
  onRestart,
  onStop,
  onReplay,
  onExploreIndependently,
}: GuidedDemoPanelProps) {
  const step = GUIDED_DEMO_STEPS[state.index];
  const progress = state.completed
    ? 100
    : state.running
      ? Math.round(((state.index + 1) / GUIDED_DEMO_STEPS.length) * 100)
      : 0;

  return (
    <section className="flowwatch-guide-section" aria-label="Guided GIS demonstration">
      <div className="flowwatch-demo-header mb-2">
        <div className="flowwatch-demo-heading">
          <div className="text-sm font-semibold">Guided GIS Demo</div>
          <div className="text-xs text-[var(--calcite-color-text-3)]">
            Seven chapters · approximately 6 minutes
          </div>
        </div>
        {!state.running && !state.completed && (
          <CalciteButton className="flowwatch-demo-start" scale="s" kind="brand" iconStart="play" onClick={onStart}>
            Start
          </CalciteButton>
        )}
      </div>

      {(state.running || state.completed) && (
        <>
          <CalciteProgress
            type="determinate"
            value={progress}
            aria-label={`Demo progress ${progress} percent`}
          />

          <div className="mt-2">
            <div className="text-xs font-semibold">
              {state.completed ? 'Tour complete' : `${step.chapter} · ${step.title}`}
            </div>
            <p className="my-1 text-xs leading-relaxed" aria-live="polite">
              {state.narration}
            </p>
            {state.actionPending && (
              <div className="text-xs text-[var(--calcite-color-text-3)]" aria-live="polite">
                Preparing the requested view; the demo will continue if a data service is unavailable.
              </div>
            )}
          </div>

          {state.notice && (
            <CalciteNotice open icon="exclamation-mark-triangle" scale="s">
              <div slot="message">{state.notice}</div>
            </CalciteNotice>
          )}

          <div className="flowwatch-demo-actions mt-2">
            {state.running && (
              <>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  iconStart="chevron-left"
                  disabled={state.index === 0 || state.actionPending}
                  onClick={onPrevious}
                >
                  Previous
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  kind="brand"
                  iconStart={state.paused ? 'play' : 'pause'}
                  onClick={state.paused ? onResume : onPause}
                >
                  {state.paused ? 'Resume' : 'Pause'}
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  iconStart="refresh"
                  disabled={state.actionPending}
                  onClick={onRestart}
                >
                  Restart
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  iconStart="chevron-right"
                  disabled={state.index === GUIDED_DEMO_STEPS.length - 1 || state.actionPending}
                  onClick={onNext}
                >
                  Next
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  iconStart="stop"
                  onClick={onStop}
                >
                  Stop Demo
                </CalciteButton>
              </>
            )}
            {state.completed && (
              <>
                <CalciteButton scale="s" kind="brand" iconStart="refresh" onClick={onReplay}>
                  Replay
                </CalciteButton>
                <CalciteButton
                  scale="s"
                  appearance="outline"
                  onClick={onExploreIndependently}
                >
                  Explore Independently
                </CalciteButton>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
