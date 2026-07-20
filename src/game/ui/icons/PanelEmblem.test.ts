// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createPanelEmblemEl, PANEL_EMBLEM_KINDS } from "./PanelEmblem";

const KINDS = PANEL_EMBLEM_KINDS;

describe("createPanelEmblemEl", () => {
  it("builds an aria-hidden emblem for every panel kind", () => {
    for (const kind of KINDS) {
      const el = createPanelEmblemEl(document, kind);
      expect(el.getAttribute("aria-hidden")).toBe("true");
      expect(el.dataset.kind).toBe(kind);
      expect(el.querySelector("svg")).not.toBeNull();
    }
  });

  it("gives each panel kind a distinct path", () => {
    const paths = KINDS.map((k) => createPanelEmblemEl(document, k).querySelector("path")!.getAttribute("d"));
    expect(new Set(paths).size).toBe(KINDS.length);
  });
});
