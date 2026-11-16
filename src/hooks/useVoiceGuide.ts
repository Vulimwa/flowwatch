import { useCallback, useEffect, useRef, useState } from 'react';

const VOICE_PREFERENCES_KEY = 'flowwatch-voice-preferences-v1';

interface VoicePreferences {
  enabled: boolean;
  voiceName: string;
  rate: number;
}

export type SpeechStatus = 'unavailable' | 'idle' | 'speaking' | 'paused';

function readPreferences(): VoicePreferences {
  const defaults: VoicePreferences = { enabled: false, voiceName: '', rate: 1 };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(VOICE_PREFERENCES_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const values = parsed as Partial<VoicePreferences>;
    return {
      enabled: values.enabled === true,
      voiceName: typeof values.voiceName === 'string' ? values.voiceName : '',
      rate: typeof values.rate === 'number' && values.rate >= 0.7 && values.rate <= 1.4
        ? values.rate
        : 1,
    };
  } catch (error) {
    console.warn('Unable to read saved voice-guide preferences.', error);
    return defaults;
  }
}

export function useVoiceGuide() {
  const preferencesRef = useRef<VoicePreferences | null>(null);
  if (preferencesRef.current === null) preferencesRef.current = readPreferences();

  const [enabled, setEnabled] = useState(preferencesRef.current.enabled);
  const [voiceName, setVoiceName] = useState(preferencesRef.current.voiceName);
  const [rate, setRate] = useState(preferencesRef.current.rate);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(false);
  const [userActivated, setUserActivated] = useState(false);
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setStatus(supported ? 'idle' : 'unavailable');
  }, [supported]);

  useEffect(() => {
    const available =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
    setSupported(available);
    setStatus(available ? 'idle' : 'unavailable');
    if (!available) return;

    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);

    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          setStatus('paused');
        }
      }
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        VOICE_PREFERENCES_KEY,
        JSON.stringify({ enabled, voiceName, rate })
      );
    } catch (storageError) {
      console.warn('Unable to save voice-guide preferences.', storageError);
      setError('Voice preferences could not be saved in this browser.');
    }
  }, [enabled, voiceName, rate]);

  const activate = useCallback(() => {
    setUserActivated(true);
    setError(null);
  }, []);

  const speak = useCallback(
    (text: string): boolean => {
      setNarrationText(text);
      if (!supported) {
        setStatus('unavailable');
        return false;
      }
      if (!enabled || !userActivated) {
        setStatus('idle');
        return false;
      }

      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      const selectedVoice = voices.find((voice) => voice.name === voiceName);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = rate;
      utterance.onstart = () => {
        utteranceRef.current = utterance;
        setStatus('speaking');
        setError(null);
      };
      utterance.onend = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
          setStatus('idle');
        }
      };
      utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          setError(`Speech playback is unavailable (${event.error}). The narration text remains available.`);
        }
        utteranceRef.current = null;
        setStatus('idle');
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [enabled, rate, supported, userActivated, voiceName, voices]
  );

  const pause = useCallback(() => {
    if (supported && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setStatus('paused');
    }
  }, [supported]);

  const resume = useCallback(() => {
    if (supported && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setStatus('speaking');
    }
  }, [supported]);

  const toggleEnabled = useCallback(() => {
    setUserActivated(true);
    setError(null);
    setEnabled((current) => {
      if (current) {
        if (supported) window.speechSynthesis.cancel();
        utteranceRef.current = null;
        setStatus(supported ? 'idle' : 'unavailable');
        return false;
      }
      return true;
    });
  }, [supported]);

  const repeat = useCallback(() => {
    if (narrationText) speak(narrationText);
  }, [narrationText, speak]);

  return {
    enabled,
    voiceName,
    rate,
    voices,
    supported,
    userActivated,
    status,
    error,
    narrationText,
    setNarrationText,
    setVoiceName,
    setRate,
    activate,
    toggleEnabled,
    speak,
    pause,
    resume,
    cancel,
    repeat,
  };
}
