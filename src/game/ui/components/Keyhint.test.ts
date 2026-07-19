// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Keyhint } from "./Keyhint";

describe("Keyhint", () => {
  it("renders the keycap and the action label", () => {
    const el = Keyhint("E", "Harvest");
    const kbd = el.querySelector("kbd");
    expect(kbd?.textContent).toBe("E");
    expect(el.textContent).toBe("EHarvest");
  });
});
