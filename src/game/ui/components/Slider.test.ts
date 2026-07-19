// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Slider } from "./Slider";

describe("Slider", () => {
  it("associates the input with its label", () => {
    const { el } = Slider({
      id: "vol",
      label: "Volume",
      min: 0,
      max: 1,
      step: 0.1,
      value: 0.5,
      onChange: () => {},
    });
    const label = el.querySelector("label");
    const input = el.querySelector("input");
    expect(label?.htmlFor).toBe("vol");
    expect(input?.id).toBe("vol");
    expect(label?.textContent).toBe("Volume");
  });

  it("reports value changes", () => {
    const onChange = vi.fn();
    const { input } = Slider({
      id: "v2",
      label: "L",
      min: 0,
      max: 10,
      step: 1,
      value: 3,
      onChange,
    });
    input.value = "7";
    input.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith(7);
  });
});
