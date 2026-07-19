/**
 * Gamepad rumble (Workstream 2.7) — feature-detected `vibrationActuator`
 * (Gamepad API), no-op when absent. Gated on the SAME reduced-motion/a11y
 * signal as camera shake and screen-effect pulses (the settings
 * `reducedMotion` flag OR the OS `prefers-reduced-motion` media query) —
 * rumble is a motion-adjacent effect, so it rides the same master toggle
 * rather than getting its own setting.
 */

export interface GamepadRumbleHandle {
  pulse(intensity: number, durationMs: number): void;
}

interface VibrationActuator {
  playEffect(type: "dual-rumble", params: { duration: number; strongMagnitude: number; weakMagnitude: number }): void;
}

export function attachGamepadRumble(reducedMotion: () => boolean): GamepadRumbleHandle {
  const supported = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
  return {
    pulse(intensity: number, durationMs: number): void {
      if (!supported || reducedMotion()) return;
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        const actuator = (pad as (Gamepad & { vibrationActuator?: VibrationActuator }) | null)
          ?.vibrationActuator;
        if (!actuator) continue;
        actuator.playEffect("dual-rumble", {
          duration: durationMs,
          strongMagnitude: Math.max(0, Math.min(1, intensity)),
          weakMagnitude: Math.max(0, Math.min(1, intensity * 0.6)),
        });
      }
    },
  };
}
