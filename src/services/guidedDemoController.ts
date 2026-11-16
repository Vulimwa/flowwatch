import {
  GUIDED_DEMO_CONCLUSION,
  GUIDED_DEMO_STEPS,
  type GuidedDemoStep,
} from '../config/voiceGuide';

export interface GuidedDemoState {
  running: boolean;
  paused: boolean;
  completed: boolean;
  actionPending: boolean;
  index: number;
  notice: string | null;
  narration: string;
}

export interface GuidedDemoStepResult {
  narration?: string;
  notice?: string;
}

export interface GuidedDemoCallbacks {
  onStateChange: (state: GuidedDemoState) => void;
  onStart: () => void;
  onStop: () => void;
  onComplete: () => void;
  onStep: (step: GuidedDemoStep, index: number) => Promise<GuidedDemoStepResult | void>;
  speak: (text: string) => boolean;
  isSpeechActive: () => boolean;
  isSpeechPaused: () => boolean;
  cancelSpeech: () => void;
  pauseSpeech: () => void;
  resumeSpeech: () => void;
}

const initialState: GuidedDemoState = {
  running: false,
  paused: false,
  completed: false,
  actionPending: false,
  index: 0,
  notice: null,
  narration: '',
};

export class GuidedDemoController {
  private state = initialState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private remainingMs = 0;
  private generation = 0;
  private enteringGeneration = 0;
  private resumeSpeechAfterPause = false;
  private narrationStarted = false;

  constructor(private readonly callbacks: GuidedDemoCallbacks) {}

  getState(): GuidedDemoState {
    return this.state;
  }

  start(): void {
    if (this.state.running) return;
    this.callbacks.onStart();
    this.setState({ ...initialState, running: true });
    void this.enterStep(0);
  }

  pause(): void {
    if (!this.state.running || this.state.paused) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.deadline));
    }
    this.resumeSpeechAfterPause = this.callbacks.isSpeechActive();
    this.callbacks.pauseSpeech();
    this.setState({ ...this.state, paused: true });
  }

  resume(): void {
    if (!this.state.running || !this.state.paused) return;
    this.setState({ ...this.state, paused: false });
    if (this.enteringGeneration === this.generation) return;
    if (this.resumeSpeechAfterPause) {
      if (this.callbacks.isSpeechPaused()) this.callbacks.resumeSpeech();
      else if (this.state.narration) this.callbacks.speak(this.state.narration);
    } else if (!this.narrationStarted && this.state.narration) {
      this.callbacks.speak(this.state.narration);
    }
    this.narrationStarted = true;
    this.resumeSpeechAfterPause = false;
    this.schedule(this.remainingMs);
  }

  previous(): void {
    if (!this.state.running || this.state.actionPending) return;
    if (this.state.index > 0) void this.enterStep(this.state.index - 1);
  }

  restart(): void {
    if (!this.state.running || this.state.actionPending) return;
    this.setState({ ...this.state, paused: false });
    void this.enterStep(0);
  }

  next(): void {
    if (!this.state.running || this.state.actionPending) return;
    if (this.state.index < GUIDED_DEMO_STEPS.length - 1) {
      void this.enterStep(this.state.index + 1);
    } else {
      this.complete();
    }
  }

  stop(): void {
    if (!this.state.running && !this.state.completed) return;
    this.clearTimer();
    this.generation += 1;
    this.enteringGeneration = 0;
    this.narrationStarted = false;
    this.resumeSpeechAfterPause = false;
    this.callbacks.cancelSpeech();
    this.callbacks.onStop();
    this.setState(initialState);
  }

  dismissCompleted(): void {
    if (!this.state.completed) return;
    this.setState(initialState);
  }

  dispose(): void {
    this.clearTimer();
    this.generation += 1;
    this.callbacks.cancelSpeech();
  }

  private deadline = 0;

  private async enterStep(index: number): Promise<void> {
    this.clearTimer();
    this.callbacks.cancelSpeech();
    const generation = ++this.generation;
    const step = GUIDED_DEMO_STEPS[index];
    this.remainingMs = step.durationMs;
    this.enteringGeneration = generation;
    this.narrationStarted = false;
    this.setState({
      running: true,
      paused: this.state.paused,
      completed: false,
      actionPending: true,
      index,
      notice: null,
      narration: step.narration,
    });

    let result: GuidedDemoStepResult | void;
    let notice: string | null = null;
    try {
      result = await this.callbacks.onStep(step, index);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'An unexpected navigation or data error occurred.';
      notice = `${step.title} could not be fully prepared: ${detail}`;
      result = {
        narration: `${step.narration} The requested view could not be fully prepared, so use the current on-screen status and continue with the text explanation.`,
      };
    }

    if (generation !== this.generation) return;
    this.enteringGeneration = 0;
    const narration = result?.narration ?? step.narration;
    this.setState({
      ...this.state,
      actionPending: false,
      notice: notice ?? result?.notice ?? null,
      narration,
    });

    if (!this.state.paused) {
      this.callbacks.speak(narration);
      this.narrationStarted = true;
      this.schedule(this.remainingMs);
    }
  }

  private complete(): void {
    this.clearTimer();
    this.generation += 1;
    this.enteringGeneration = 0;
    this.narrationStarted = false;
    this.resumeSpeechAfterPause = false;
    this.callbacks.cancelSpeech();
    this.callbacks.onComplete();
    this.setState({
      ...initialState,
      completed: true,
      index: GUIDED_DEMO_STEPS.length - 1,
      narration: GUIDED_DEMO_CONCLUSION,
    });
    this.callbacks.speak(GUIDED_DEMO_CONCLUSION);
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    this.remainingMs = Math.max(0, delayMs);
    this.deadline = Date.now() + this.remainingMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.callbacks.isSpeechActive()) {
        this.schedule(500);
        return;
      }
      this.next();
    }, this.remainingMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: GuidedDemoState): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }
}
