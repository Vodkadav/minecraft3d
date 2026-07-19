// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createLocalizer } from "../i18n/strings";
import { TUTORIAL_OBJECTIVES } from "../../domain/progression/Objectives";
import { emptyProgression, recordProgressionEvent } from "../../domain/progression/ProgressionState";
import { ObjectiveTracker } from "./ObjectiveTracker";

describe("ObjectiveTracker", () => {
  it("mounts a labelled, live-region panel", () => {
    const tracker = ObjectiveTracker(createLocalizer("en"));
    expect(tracker.el.getAttribute("role")).toBe("status");
    expect(tracker.el.getAttribute("aria-live")).toBe("polite");
    tracker.dispose();
  });

  it("renders the current objective's title and progress", () => {
    const tracker = ObjectiveTracker(createLocalizer("en"));
    const state = emptyProgression();
    tracker.render(TUTORIAL_OBJECTIVES[0]!, state.counts);
    expect(tracker.el.textContent).toContain("Harvest a resource");
    expect(tracker.el.textContent).toContain("0/1");
    tracker.dispose();
  });

  it("updates progress as counts change", () => {
    const tracker = ObjectiveTracker(createLocalizer("en"));
    let state = emptyProgression();
    state = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, []).state;
    tracker.render(TUTORIAL_OBJECTIVES[0]!, state.counts);
    expect(tracker.el.textContent).toContain("1/1");
    tracker.dispose();
  });

  it("shows the complete message and hides skip once objective is null", () => {
    const tracker = ObjectiveTracker(createLocalizer("en"));
    tracker.render(null, emptyProgression().counts);
    expect(tracker.el.textContent).toContain("All objectives complete!");
    const skip = tracker.el.querySelector("button")!;
    expect(skip.hidden).toBe(true);
    tracker.dispose();
  });

  it("fires onSkipTutorial when the skip button is clicked", () => {
    const onSkip = vi.fn();
    const tracker = ObjectiveTracker(createLocalizer("en"), { onSkipTutorial: onSkip });
    tracker.render(TUTORIAL_OBJECTIVES[0]!, emptyProgression().counts);
    const skip = tracker.el.querySelector("button")!;
    skip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSkip).toHaveBeenCalledOnce();
    tracker.dispose();
  });

  it("dispose removes the panel from the document", () => {
    const tracker = ObjectiveTracker(createLocalizer("en"));
    document.body.appendChild(document.createElement("div")); // sanity noise
    expect(document.body.contains(tracker.el)).toBe(true);
    tracker.dispose();
    expect(document.body.contains(tracker.el)).toBe(false);
  });
});
