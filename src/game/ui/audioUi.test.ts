// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { InMemoryAudioPort } from "../application/testing/InMemoryAudioPort";
import { wireButtonSound } from "./audioUi";

describe("wireButtonSound", () => {
  it("plays uiClick on click and uiHover on mouseenter/focus", () => {
    const audio = new InMemoryAudioPort();
    const btn = document.createElement("button");
    wireButtonSound(btn, audio);

    btn.dispatchEvent(new Event("click"));
    btn.dispatchEvent(new Event("mouseenter"));
    btn.dispatchEvent(new Event("focus"));

    expect(audio.plays.map((p) => p.event)).toEqual(["uiClick", "uiHover", "uiHover"]);
  });

  it("is a no-op with no audio port", () => {
    const btn = document.createElement("button");
    expect(() => wireButtonSound(btn, undefined)).not.toThrow();
    expect(() => btn.dispatchEvent(new Event("click"))).not.toThrow();
  });
});
