/**
 * Composition-root adapter implementing `FeelPort` (Workstream 2) — the
 * juice counterpart to `WebAudioAdapter`. Owns the pure `FeelState` (domain/
 * feel/FeelState) and threads it frame to frame; `trigger()` is the one call
 * every combat/harvest/dig/place/tame site makes (mirrors `AudioPort.play`,
 * so one game event fans out to both audio AND feel). Untested composition/
 * browser-API glue by repo convention (see WebAudioAdapter) — the pure
 * mapping/decay math it calls into is unit-tested in domain/feel.
 */

import {
  applyFeedback,
  emptyFeelState,
  shakeMagnitude,
  tickFeel,
  type FeelState,
} from "../game/domain/feel/FeelState";
import { resolveFeedback, type FeelEventId } from "../game/domain/feel/FeelEvents";
import type { FeelPort, FeelTriggerOptions } from "../game/application/ports/FeelPort";
import type { DamageNumbersHandle } from "./DamageNumbers";
import type { ScreenEffectsHandle } from "./ScreenEffects";
import type { ImpactParticlesHandle } from "./ImpactParticles";
import type { GamepadRumbleHandle } from "./GamepadRumble";

/** Below this hit-stop remaining, presentation dt scaling is skipped — avoids
 *  a permanent tiny slowdown from float dust near zero. */
const HIT_STOP_EPS_MS = 1;
/** How much presentation dt is scaled down while hit-stop is active. */
const HIT_STOP_DT_SCALE = 0.15;

export interface FeelDirectorDeps {
  readonly damageNumbers?: DamageNumbersHandle;
  readonly screenEffects?: ScreenEffectsHandle;
  readonly particles?: ImpactParticlesHandle;
  readonly rumble?: GamepadRumbleHandle;
}

export class FeelDirector implements FeelPort {
  private state: FeelState = emptyFeelState();

  constructor(private readonly deps: FeelDirectorDeps) {}

  trigger(event: FeelEventId, opts?: FeelTriggerOptions): void {
    const bundle = resolveFeedback(event, { crit: opts?.crit });
    this.state = applyFeedback(this.state, bundle);
    if (bundle.damageNumber && opts?.worldPos && opts.damageValue !== undefined) {
      this.deps.damageNumbers?.spawn(opts.worldPos, opts.damageValue, opts.crit ?? false);
    }
    if (bundle.particleBurst && opts?.worldPos) {
      this.deps.particles?.burst(bundle.particleBurst, opts.worldPos);
    }
    if (bundle.rumble) {
      this.deps.rumble?.pulse(bundle.rumble.intensity, bundle.rumble.durationMs);
    }
  }

  /** Advance decay; call once per frame. */
  tick(dt: number): void {
    this.state = tickFeel(this.state, dt);
    this.deps.screenEffects?.render(this.state.vignettePulses);
  }

  /** 0..1 camera-shake magnitude for this frame (see domain/feel/FeelState). */
  shakeMagnitude(): number {
    return shakeMagnitude(this.state);
  }

  /** Scale a raw frame dt down while a hit-stop window is active — for
   *  PRESENTATION consumers only (animation mixers, camera FOV punch); the
   *  simulation/netcode dt must never be scaled (see SpawnFieldView). */
  presentationDt(rawDt: number): number {
    return this.state.hitStopMs > HIT_STOP_EPS_MS ? rawDt * HIT_STOP_DT_SCALE : rawDt;
  }

  /** Whether a hit-stop window is active right now (drives the camera FOV punch). */
  hitStopActive(): boolean {
    return this.state.hitStopMs > HIT_STOP_EPS_MS;
  }

  setLowHealth(active: boolean): void {
    this.deps.screenEffects?.setLowHealth(active);
  }
}
