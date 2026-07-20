// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { emptyResearchState } from "../domain/research/ResearchTree";
import { emptyProgression, type ProgressionState } from "../domain/progression/ProgressionState";
import { createLocalizer } from "./i18n/strings";
import { mountResearchScreen } from "./ResearchScreen";

function progressionWithDig(n: number): ProgressionState {
  const base = emptyProgression();
  return { ...base, counts: { ...base.counts, dig: n } };
}

describe("mountResearchScreen", () => {
  it("starts closed", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: emptyProgression(),
    });
    expect(screen.isOpen).toBe(false);
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(true);
    screen.dispose();
  });

  it("pressing J opens the overlay, releases pointer lock, and pauses input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: emptyProgression(),
      setInputEnabled,
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    screen.dispose();
  });

  it("pressing J again closes it and restores input", () => {
    const setInputEnabled = vi.fn();
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: emptyProgression(),
      setInputEnabled,
    });
    screen.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "J", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });

  it("Escape closes the overlay", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: emptyProgression(),
    });
    screen.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("does not toggle on 'j' typed into a focused text input", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: emptyProgression(),
    });
    screen.open();
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(screen.isOpen).toBe(true);
    input.remove();
    screen.dispose();
  });

  it("shows the available research point count and renders every branch", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: progressionWithDig(5),
    });
    screen.open();
    expect(document.querySelector(".lw-research-points")?.textContent).toBe("1 research points available");
    expect(document.querySelectorAll(".lw-research-branch").length).toBe(3);
    screen.dispose();
  });

  it("a root node's Unlock button is enabled once affordable", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: progressionWithDig(5),
    });
    screen.open();
    const row = document.querySelector('[data-node-id="sharpTools"]');
    expect(row?.getAttribute("data-status")).toBe("affordable");
    const btn = row?.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    screen.dispose();
  });

  it("a node behind an unmet prereq is locked and its button disabled", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: progressionWithDig(50), // plenty of points, prereq still unmet
    });
    screen.open();
    const row = document.querySelector('[data-node-id="efficientHarvest"]');
    expect(row?.getAttribute("data-status")).toBe("locked");
    const btn = row?.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(row?.textContent).toContain("Learn the earlier research first");
    screen.dispose();
  });

  it("clicking Unlock spends points and marks the node unlocked, firing onResearchChange", () => {
    const onResearchChange = vi.fn();
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: progressionWithDig(5),
      onResearchChange,
    });
    screen.open();
    const row = document.querySelector('[data-node-id="sharpTools"]');
    const btn = row?.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(onResearchChange).toHaveBeenCalled();
    expect(screen.research.unlockedNodeIds).toEqual(["sharpTools"]);
    const rowAfter = document.querySelector('[data-node-id="sharpTools"]');
    expect(rowAfter?.getAttribute("data-status")).toBe("unlocked");
    const btnAfter = rowAfter?.querySelector("button") as HTMLButtonElement;
    expect(btnAfter.disabled).toBe(true);
    expect(btnAfter.textContent).toBe("Unlocked");
    screen.dispose();
  });

  it("setResearch and setProgression update the open screen live without a remount", () => {
    const screen = mountResearchScreen({
      loc: createLocalizer("en"),
      research: emptyResearchState(),
      progression: emptyProgression(),
    });
    screen.open();
    expect(document.querySelector(".lw-research-points")?.textContent).toBe("0 research points available");
    screen.setProgression(progressionWithDig(10));
    expect(document.querySelector(".lw-research-points")?.textContent).toBe("2 research points available");
    screen.dispose();
  });
});
