'use client';

import { useCallback, useEffect, useRef } from 'react';

export type FeedbackTone = 'success' | 'gas' | 'warning' | 'error' | 'tap';

interface ToneSpec {
  /** Pares [frecuencia Hz, offset en segundos]. */
  notes: Array<[number, number]>;
  type: OscillatorType;
  duration: number;
  gain: number;
  /** Patrón para `navigator.vibrate`. */
  vibration: number | number[];
}

/**
 * Cada registro de gasto suena distinto para que el pulgar aprenda sin mirar
 * la pantalla: un clic agudo satisfactorio cuando hay cupo, un golpe sordo y
 * grave cuando te pasaste.
 */
const TONES: Record<FeedbackTone, ToneSpec> = {
  success: {
    notes: [
      [880, 0],
      [1320, 0.055],
    ],
    type: 'triangle',
    duration: 0.14,
    gain: 0.16,
    vibration: 18,
  },
  gas: {
    notes: [
      [523.25, 0],
      [783.99, 0.06],
    ],
    type: 'sine',
    duration: 0.18,
    gain: 0.14,
    vibration: [12, 28, 12],
  },
  warning: {
    notes: [
      [420, 0],
      [330, 0.08],
    ],
    type: 'square',
    duration: 0.2,
    gain: 0.1,
    vibration: [24, 40, 24],
  },
  error: {
    notes: [
      [150, 0],
      [98, 0.09],
    ],
    type: 'sawtooth',
    duration: 0.34,
    gain: 0.13,
    vibration: [40, 60, 90],
  },
  tap: {
    notes: [[1180, 0]],
    type: 'sine',
    duration: 0.05,
    gain: 0.07,
    vibration: 8,
  },
};

interface UseHapticSoundOptions {
  sound?: boolean;
  haptics?: boolean;
}

/**
 * Feedback sonoro sintetizado con Web Audio API + vibración.
 *
 * No carga un solo archivo de audio: los tonos se generan con osciladores, así
 * que el bundle no crece y el disparo es inmediato incluso offline. El
 * `AudioContext` se crea de forma perezosa en el primer gesto del usuario para
 * respetar la política de autoplay de los navegadores móviles.
 */
export function useHapticSound(options: UseHapticSoundOptions = {}) {
  const { sound = true, haptics = true } = options;
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== 'closed') void context.close();
    };
  }, []);

  const getContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (contextRef.current) return contextRef.current;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    try {
      contextRef.current = new Ctor();
      return contextRef.current;
    } catch {
      return null;
    }
  }, []);

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (!haptics || typeof navigator === 'undefined') return;
      if (typeof navigator.vibrate !== 'function') return;
      try {
        navigator.vibrate(pattern);
      } catch {
        /* Safari iOS no lo soporta: se ignora en silencio. */
      }
    },
    [haptics],
  );

  const play = useCallback(
    (tone: FeedbackTone = 'success') => {
      const spec = TONES[tone];
      vibrate(spec.vibration);

      if (!sound) return;
      const context = getContext();
      if (!context) return;

      // Un gesto del usuario puede encontrar el contexto suspendido.
      if (context.state === 'suspended') void context.resume();

      const now = context.currentTime;

      for (const [frequency, offset] of spec.notes) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();

        oscillator.type = spec.type;
        oscillator.frequency.setValueAtTime(frequency, now + offset);

        // Ataque muy corto y decaimiento exponencial: se percibe como un clic
        // físico en vez de un pitido.
        envelope.gain.setValueAtTime(0.0001, now + offset);
        envelope.gain.exponentialRampToValueAtTime(spec.gain, now + offset + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + offset + spec.duration);

        oscillator.connect(envelope);
        envelope.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + spec.duration + 0.02);
      }
    },
    [getContext, sound, vibrate],
  );

  return { play, vibrate };
}
