import { describe, expect, it } from "vitest";
import { AUDIO_BUSES, AUDIO_EVENT_IDS, AUDIO_EVENTS, audioEventDef } from "./AudioEvents";

describe("AudioEvents registry", () => {
  it("every event id maps to a def with a matching id field", () => {
    for (const id of AUDIO_EVENT_IDS) {
      expect(AUDIO_EVENTS[id].id).toBe(id);
    }
  });

  it("every event's bus is one of the declared buses", () => {
    for (const id of AUDIO_EVENT_IDS) {
      expect(AUDIO_BUSES).toContain(AUDIO_EVENTS[id].bus);
    }
  });

  it("gain is within 0..1 and cooldown/priority are non-negative", () => {
    for (const id of AUDIO_EVENT_IDS) {
      const def = AUDIO_EVENTS[id];
      expect(def.gain).toBeGreaterThan(0);
      expect(def.gain).toBeLessThanOrEqual(1);
      expect(def.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(def.priority).toBeGreaterThan(0);
    }
  });

  it("audioEventDef resolves the same object as direct lookup", () => {
    expect(audioEventDef("footstep")).toBe(AUDIO_EVENTS.footstep);
  });

  it("ambient and music events are 0-cooldown loop beds, not spatial one-shots", () => {
    expect(AUDIO_EVENTS.ambientWind.spatial).toBe(false);
    expect(AUDIO_EVENTS.ambientWind.cooldownMs).toBe(0);
    expect(AUDIO_EVENTS.musicCalm.spatial).toBe(false);
  });
});
