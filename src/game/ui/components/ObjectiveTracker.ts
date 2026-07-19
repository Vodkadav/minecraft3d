/**
 * ObjectiveTracker — the corner HUD panel that always answers "what now?"
 * (Workstream 6.3). Purely presentational: `render` is handed the domain's
 * `currentObjective` result (ProgressionState.ts) plus its progress metric
 * and redraws; no progression logic lives here. A "skip tutorial" control is
 * always present so a returning/impatient player can dismiss the chain.
 */

import type { Objective, ProgressionCounts } from "../../domain/progression/ProgressionState";
import { objectiveProgress } from "../../domain/progression/ProgressionState";
import type { Localizer } from "../../application/i18n/Localizer";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface ObjectiveTrackerHandle {
  readonly el: HTMLElement;
  /** `null` objective means the tracked chain is complete (or skipped). */
  render(objective: Objective | null, counts: ProgressionCounts): void;
  dispose(): void;
}

export function ObjectiveTracker(
  loc: Localizer,
  opts: { onSkipTutorial?(): void; doc?: Document } = {},
): ObjectiveTrackerHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const title = doc.createElement("div");
  title.className = "lw-objective-title";
  title.textContent = loc.t("objective.tracker.title");

  const text = doc.createElement("div");
  text.className = "lw-objective-text";

  const progress = doc.createElement("div");
  progress.className = "lw-objective-progress";

  const skipBtn = doc.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "laas-ui lw-button";
  skipBtn.dataset.variant = "quiet";
  skipBtn.textContent = loc.t("objective.tracker.skip");
  skipBtn.setAttribute("aria-label", loc.t("objective.tracker.skip.aria"));
  skipBtn.addEventListener("click", () => opts.onSkipTutorial?.());

  const panel = Panel([title, text, progress, skipBtn], {
    className: "lw-objective-tracker",
    ariaLabel: loc.t("objective.tracker.title"),
  });
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  doc.body.appendChild(panel);

  return {
    el: panel,
    render(objective, counts): void {
      if (!objective) {
        text.textContent = loc.t("objective.tracker.complete");
        progress.textContent = "";
        skipBtn.hidden = true;
        return;
      }
      text.textContent = loc.t(objective.titleKey);
      const p = objectiveProgress(objective, counts);
      progress.textContent = p
        ? loc.t("objective.tracker.progress", { current: p.current, target: p.target })
        : "";
      skipBtn.hidden = false;
    },
    dispose(): void {
      panel.remove();
    },
  };
}
