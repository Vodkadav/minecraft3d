/**
 * Audio port for Workstream 1 (ADR-less; mirrors how NetTransport/WorldSave
 * are already structured). The application/UI layers only ever see this
 * interface; the browser's Web Audio graph lives behind the
 * infrastructure/audio adapter, and tests use the in-memory fake.
 */

import type { AudioBus, AudioEventId } from "../../domain/audio/AudioEvents";

export interface PlayOptions {
  /** World-space position for a spatial event; ignored for 2D events. */
  readonly position?: readonly [number, number, number];
  /** Extra gain multiplier (0..1) layered on the event's base gain. */
  readonly gain?: number;
}

export interface AudioPort {
  /** Fire a one-shot (or re-triggered) event, subject to its own cooldown. */
  play(event: AudioEventId, opts?: PlayOptions): void;
  /** Set a mixer bus's volume, 0..1. */
  setBusVolume(bus: AudioBus, volume: number): void;
  /** Cross-fade to a named music state (e.g. "calm"). */
  startMusicState(id: string): void;
  /** Start a looping ambient bed keyed by event id (idempotent while playing). */
  startAmbient(id: AudioEventId, opts?: PlayOptions): void;
  /** Stop a looping ambient bed started with `startAmbient`. */
  stopAmbient(id: AudioEventId): void;
}
