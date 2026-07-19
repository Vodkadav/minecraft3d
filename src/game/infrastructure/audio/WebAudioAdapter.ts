/**
 * Browser AudioPort adapter (Workstream 1.3): a Web Audio bus graph
 * (master -> music/sfx/ambient/ui), PannerNode spatialization tied to a
 * listener pose the composition root feeds in every frame, procedurally
 * synthesized SFX (Workstream 1.5 — oscillators/noise, zero audio files),
 * and resume-on-user-gesture handling (browsers block autoplay until the
 * first interaction). Untested composition/browser-API glue by repo
 * convention (see LocalStorageSettingsStore) — the pure synthesis math it
 * calls into (SynthRecipes) and the cooldown logic (domain/audio) are
 * unit-tested on their own.
 *
 * Looping beds (ambient wind, the calm music state) are NOT a long buffer —
 * every "loop" is really the one-shot synth self-stopping and re-triggering
 * on a timer sized to its own envelope, so nothing outlives its `stop()`.
 * The noise buffer itself IS pooled (one shared 2s buffer reused by every
 * BufferSourceNode instance — sources are single-use by the Web Audio spec,
 * so the pooling is at the buffer level, not the transient source node).
 */

import {
  emptyCooldownState,
  resolvePlay,
  type CooldownState,
} from "../../domain/audio/AudioCooldown";
import {
  AUDIO_BUSES,
  AUDIO_EVENTS,
  type AudioBus,
  type AudioEventId,
} from "../../domain/audio/AudioEvents";
import type { AudioPort, PlayOptions } from "../../application/ports/AudioPort";
import { envelopeTimes, synthRecipeFor, type ToneRecipe } from "./SynthRecipes";

export interface ListenerPose {
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}

const RESUME_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/** Calm-state generative music: a small pentatonic set, one random note per
 *  loop iteration — enough variation to not feel like a static drone. */
const CALM_NOTES_HZ = [261.6, 293.7, 329.6, 392.0, 440.0];

export class WebAudioAdapter implements AudioPort {
  private readonly ctx: AudioContext;
  private readonly busGains: Record<AudioBus, GainNode>;
  private noiseBuffer: AudioBuffer | null = null;
  private cooldown: CooldownState = emptyCooldownState();
  private readonly loops = new Map<string, ReturnType<typeof setInterval>>();
  private disposed = false;

  constructor(win: typeof window = window) {
    const Ctor =
      win.AudioContext ??
      (win as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    const master = this.ctx.createGain();
    master.connect(this.ctx.destination);
    const buses = { master } as Record<AudioBus, GainNode>;
    for (const bus of AUDIO_BUSES) {
      if (bus === "master") continue;
      const g = this.ctx.createGain();
      g.connect(master);
      buses[bus] = g;
    }
    this.busGains = buses;

    const resume = (): void => {
      void this.ctx.resume();
    };
    for (const evt of RESUME_EVENTS) {
      win.addEventListener(evt, resume, { once: true, passive: true });
    }
  }

  play(event: AudioEventId, opts?: PlayOptions): void {
    if (this.disposed) return;
    const nowMs = this.ctx.currentTime * 1000;
    const r = resolvePlay(this.cooldown, event, nowMs);
    if (!r.allow) return;
    this.cooldown = r.state;
    this.trigger(event, opts);
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    if (this.disposed) return;
    this.busGains[bus].gain.value = Math.max(0, Math.min(1, volume));
  }

  startMusicState(id: string): void {
    if (this.disposed) return;
    this.stopLoop("music");
    // A single "calm" state today; more states would branch on `id` here.
    void id;
    const recipe = synthRecipeFor("musicCalm") as ToneRecipe;
    const fire = (): void => {
      const note = CALM_NOTES_HZ[Math.floor(Math.random() * CALM_NOTES_HZ.length)]!;
      this.playTone({ ...recipe, freqStartHz: note, freqEndHz: note }, "music", undefined);
    };
    fire();
    this.loops.set("music", setInterval(fire, recipe.durationS * 1000));
  }

  startAmbient(id: AudioEventId, opts?: PlayOptions): void {
    if (this.disposed || this.loops.has(`ambient:${id}`)) return;
    const recipe = synthRecipeFor(id);
    const fire = (): void => this.trigger(id, opts);
    fire();
    const periodMs = recipe.durationS * 1000;
    this.loops.set(`ambient:${id}`, setInterval(fire, periodMs));
  }

  stopAmbient(id: AudioEventId): void {
    this.stopLoop(`ambient:${id}`);
  }

  /** Composition root calls this every frame with the camera pose so
   *  spatial (PannerNode) sounds pan/attenuate correctly (task 1.3). */
  updateListener(pose: ListenerPose): void {
    if (this.disposed) return;
    const listener = this.ctx.listener;
    const [px, py, pz] = pose.position;
    const [fx, fy, fz] = pose.forward;
    const [ux, uy, uz] = pose.up;
    if (listener.positionX) {
      listener.positionX.value = px;
      listener.positionY.value = py;
      listener.positionZ.value = pz;
      listener.forwardX.value = fx;
      listener.forwardY.value = fy;
      listener.forwardZ.value = fz;
      listener.upX.value = ux;
      listener.upY.value = uy;
      listener.upZ.value = uz;
    } else {
      // Pre-2021 Safari fallback (deprecated but still present there).
      const l = listener as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.loops.values()) clearInterval(timer);
    this.loops.clear();
    void this.ctx.close();
  }

  // ---- synthesis ----

  private stopLoop(key: string): void {
    const timer = this.loops.get(key);
    if (timer === undefined) return;
    clearInterval(timer);
    this.loops.delete(key);
  }

  private noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const seconds = 2;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  private connectOut(node: AudioNode, bus: GainNode, opts: PlayOptions | undefined): void {
    if (!opts?.position) {
      node.connect(bus);
      return;
    }
    const panner = this.ctx.createPanner();
    panner.panningModel = "equalpower";
    panner.distanceModel = "inverse";
    panner.refDistance = 3;
    panner.maxDistance = 80;
    const [x, y, z] = opts.position;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
        x,
        y,
        z,
      );
    }
    node.connect(panner);
    panner.connect(bus);
  }

  private envelopeGain(durationS: number, peak: number): { gain: GainNode; endTime: number } {
    const now = this.ctx.currentTime;
    const env = envelopeTimes(now, durationS, peak);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, env.startTime);
    gain.gain.linearRampToValueAtTime(env.peak, env.attackEndTime);
    gain.gain.linearRampToValueAtTime(0, env.releaseEndTime);
    return { gain, endTime: env.releaseEndTime };
  }

  private playTone(recipe: ToneRecipe, busId: AudioBus, opts: PlayOptions | undefined): void {
    const now = this.ctx.currentTime;
    const peak = (opts?.gain ?? 1) * (AUDIO_EVENTS.musicCalm.gain ?? 0.5);
    const { gain, endTime } = this.envelopeGain(recipe.durationS, peak);
    const osc = this.ctx.createOscillator();
    osc.type = recipe.type;
    osc.frequency.setValueAtTime(recipe.freqStartHz, now);
    osc.frequency.linearRampToValueAtTime(recipe.freqEndHz, now + recipe.durationS);
    osc.connect(gain);
    this.connectOut(gain, this.busGains[busId], opts);
    osc.start(now);
    osc.stop(endTime + 0.02);
  }

  /** One-shot synth: builds oscillator/noise + envelope + optional panner,
   *  starts it, and it garbage-collects itself once it stops. */
  private trigger(event: AudioEventId, opts: PlayOptions | undefined): void {
    const recipe = synthRecipeFor(event);
    const def = AUDIO_EVENTS[event];
    const bus = this.busGains[def.bus];
    const now = this.ctx.currentTime;
    const peak = (opts?.gain ?? 1) * def.gain;
    const { gain, endTime } = this.envelopeGain(recipe.durationS, peak);

    if (recipe.kind === "tone") {
      const osc = this.ctx.createOscillator();
      osc.type = recipe.type;
      osc.frequency.setValueAtTime(recipe.freqStartHz, now);
      osc.frequency.linearRampToValueAtTime(recipe.freqEndHz, now + recipe.durationS);
      osc.connect(gain);
      this.connectOut(gain, bus, opts);
      osc.start(now);
      osc.stop(endTime + 0.02);
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = recipe.filterHz;
      src.connect(filter);
      filter.connect(gain);
      this.connectOut(gain, bus, opts);
      src.start(now);
      src.stop(endTime + 0.02);
    }
  }
}
