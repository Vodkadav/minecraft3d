import { describe, expect, it } from "vitest";
import { InMemoryAudioPort } from "./InMemoryAudioPort";

describe("InMemoryAudioPort", () => {
  it("records play calls with their options", () => {
    const port = new InMemoryAudioPort();
    port.play("hit", { position: [1, 2, 3], gain: 0.8 });
    expect(port.plays).toEqual([{ event: "hit", opts: { position: [1, 2, 3], gain: 0.8 } }]);
  });

  it("records bus volume changes", () => {
    const port = new InMemoryAudioPort();
    port.setBusVolume("music", 0.4);
    expect(port.busVolumes).toEqual([{ bus: "music", volume: 0.4 }]);
  });

  it("records music state switches", () => {
    const port = new InMemoryAudioPort();
    port.startMusicState("calm");
    expect(port.musicStates).toEqual(["calm"]);
  });

  it("tracks ambient beds as start/stop toggle a set", () => {
    const port = new InMemoryAudioPort();
    port.startAmbient("ambientWind");
    expect(port.activeAmbients.has("ambientWind")).toBe(true);
    port.stopAmbient("ambientWind");
    expect(port.activeAmbients.has("ambientWind")).toBe(false);
  });
});
