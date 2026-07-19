/**
 * In-memory AudioPort fake — records every call instead of touching Web
 * Audio, so application/UI wiring tests can assert "the right sound fired"
 * without a browser audio context.
 */

import type { AudioBus, AudioEventId } from "../../domain/audio/AudioEvents";
import type { AudioPort, PlayOptions } from "../ports/AudioPort";

export interface PlayCall {
  readonly event: AudioEventId;
  readonly opts: PlayOptions | undefined;
}

export interface BusVolumeCall {
  readonly bus: AudioBus;
  readonly volume: number;
}

export class InMemoryAudioPort implements AudioPort {
  readonly plays: PlayCall[] = [];
  readonly busVolumes: BusVolumeCall[] = [];
  readonly musicStates: string[] = [];
  readonly activeAmbients = new Set<AudioEventId>();

  play(event: AudioEventId, opts?: PlayOptions): void {
    this.plays.push({ event, opts });
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    this.busVolumes.push({ bus, volume });
  }

  startMusicState(id: string): void {
    this.musicStates.push(id);
  }

  startAmbient(id: AudioEventId): void {
    this.activeAmbients.add(id);
  }

  stopAmbient(id: AudioEventId): void {
    this.activeAmbients.delete(id);
  }
}
