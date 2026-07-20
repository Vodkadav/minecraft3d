// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TooltipModel } from "../../domain/ui/TooltipModel";
import { RichTooltip } from "./RichTooltip";

function touchEvent(type: string, x: number, y: number): Event {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches: [{ clientX: x, clientY: y }],
  });
}

function baseModel(overrides: Partial<TooltipModel> = {}): TooltipModel {
  return {
    itemId: "iron-sword",
    name: "Iron Sword",
    rarityTier: "rare",
    category: "weapon",
    tags: ["tool", "weapon"],
    rows: [
      { label: "Category", value: "Weapon" },
      { label: "Damage", value: "18" },
    ],
    ...overrides,
  };
}

describe("RichTooltip", () => {
  let anchor: HTMLElement;

  beforeEach(() => {
    anchor = document.createElement("div");
    anchor.tabIndex = 0;
    document.body.appendChild(anchor);
  });

  afterEach(() => {
    anchor.remove();
    vi.useRealTimers();
  });

  it("links the anchor via aria-describedby, renders role=tooltip, hidden initially", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    const id = anchor.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(handle.el.id).toBe(id);
    expect(handle.el.getAttribute("role")).toBe("tooltip");
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("renders the rarity tier as a data attribute for CSS token mapping", () => {
    const handle = RichTooltip({ anchor, model: baseModel({ rarityTier: "legendary" }) });
    expect(handle.el.dataset.rarity).toBe("legendary");
    handle.dispose();
  });

  it("renders the localized name and stat rows from the model", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    expect(handle.el.querySelector(".lw-rich-tooltip-name")?.textContent).toBe("Iron Sword");
    const rowLabels = [...handle.el.querySelectorAll(".lw-rich-tooltip-rows dt")].map((el) => el.textContent);
    const rowValues = [...handle.el.querySelectorAll(".lw-rich-tooltip-rows dd")].map((el) => el.textContent);
    expect(rowLabels).toEqual(["Category", "Damage"]);
    expect(rowValues).toEqual(["Weapon", "18"]);
    handle.dispose();
  });

  it("shows a quantity badge only when quantity > 1", () => {
    const one = RichTooltip({ anchor, model: baseModel({ quantity: 1 }) });
    expect(one.el.querySelector<HTMLElement>(".lw-rich-tooltip-qty")?.hidden).toBe(true);
    one.dispose();

    const anchor2 = document.createElement("div");
    document.body.appendChild(anchor2);
    const many = RichTooltip({ anchor: anchor2, model: baseModel({ quantity: 5 }) });
    const qty = many.el.querySelector<HTMLElement>(".lw-rich-tooltip-qty");
    expect(qty?.hidden).toBe(false);
    expect(qty?.textContent).toBe("x5");
    many.dispose();
    anchor2.remove();
  });

  it("renders keyhints only when provided", () => {
    const none = RichTooltip({ anchor, model: baseModel() });
    expect(none.el.querySelector<HTMLElement>(".lw-rich-tooltip-keyhints")?.hidden).toBe(true);
    none.dispose();

    const withHints = RichTooltip({
      anchor,
      model: baseModel({ keyhints: ["Right-click to split the stack"] }),
    });
    const hints = withHints.el.querySelector<HTMLElement>(".lw-rich-tooltip-keyhints");
    expect(hints?.hidden).toBe(false);
    expect(hints?.textContent).toContain("Right-click to split the stack");
    withHints.dispose();
  });

  it("shows on mouseenter and hides on mouseleave", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    anchor.dispatchEvent(new MouseEvent("mouseenter"));
    expect(handle.el.hidden).toBe(false);
    anchor.dispatchEvent(new MouseEvent("mouseleave"));
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("shows on keyboard focus and hides on blur", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    anchor.dispatchEvent(new FocusEvent("focus"));
    expect(handle.el.hidden).toBe(false);
    anchor.dispatchEvent(new FocusEvent("blur"));
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("Escape hides an open tooltip regardless of how it was opened", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    anchor.dispatchEvent(new FocusEvent("focus"));
    expect(handle.el.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("a tap outside the anchor dismisses an open tooltip", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    anchor.dispatchEvent(new MouseEvent("mouseenter"));
    expect(handle.el.hidden).toBe(false);
    document.body.dispatchEvent(touchEvent("touchstart", 999, 999));
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("touch long-press opens the card after the hold duration", () => {
    vi.useFakeTimers();
    const handle = RichTooltip({ anchor, model: baseModel(), longPressMs: 500 });
    anchor.dispatchEvent(touchEvent("touchstart", 10, 10));
    expect(handle.el.hidden).toBe(true);
    vi.advanceTimersByTime(499);
    expect(handle.el.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(handle.el.hidden).toBe(false);
    handle.dispose();
  });

  it("a short tap (touchend before the hold duration) never opens the card", () => {
    vi.useFakeTimers();
    const handle = RichTooltip({ anchor, model: baseModel(), longPressMs: 500 });
    anchor.dispatchEvent(touchEvent("touchstart", 10, 10));
    anchor.dispatchEvent(new Event("touchend", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("a touchmove past the cancel threshold cancels the pending long-press", () => {
    vi.useFakeTimers();
    const handle = RichTooltip({ anchor, model: baseModel(), longPressMs: 500 });
    anchor.dispatchEvent(touchEvent("touchstart", 10, 10));
    anchor.dispatchEvent(touchEvent("touchmove", 100, 100)); // well past the cancel threshold
    vi.advanceTimersByTime(1000);
    expect(handle.el.hidden).toBe(true);
    handle.dispose();
  });

  it("update() re-renders content in place without creating a new element", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    const before = handle.el;
    handle.update(baseModel({ name: "Steel Sword", rarityTier: "epic", rows: [{ label: "Damage", value: "22" }] }));
    expect(handle.el).toBe(before);
    expect(handle.el.querySelector(".lw-rich-tooltip-name")?.textContent).toBe("Steel Sword");
    expect(handle.el.dataset.rarity).toBe("epic");
    const rowLabels = [...handle.el.querySelectorAll(".lw-rich-tooltip-rows dt")].map((el) => el.textContent);
    expect(rowLabels).toEqual(["Damage"]);
    handle.dispose();
  });

  it("dispose removes the card, the aria link, and stops responding to events", () => {
    const handle = RichTooltip({ anchor, model: baseModel() });
    const id = anchor.getAttribute("aria-describedby")!;
    handle.dispose();
    expect(anchor.hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById(id)).toBeNull();
    anchor.dispatchEvent(new MouseEvent("mouseenter"));
    expect(handle.el.hidden).toBe(true); // no listener left to react
  });

  it("positions the card within the viewport even when the anchor is near the edge", () => {
    anchor.getBoundingClientRect = () =>
      ({ left: 2000, top: 5, right: 2040, bottom: 25, width: 40, height: 20, x: 2000, y: 5, toJSON() {} }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });
    const handle = RichTooltip({ anchor, model: baseModel() });
    anchor.dispatchEvent(new MouseEvent("mouseenter"));
    const left = parseFloat(handle.el.style.left);
    const top = parseFloat(handle.el.style.top);
    expect(left).toBeLessThanOrEqual(1024 - 4);
    expect(left).toBeGreaterThanOrEqual(4);
    expect(top).toBeGreaterThanOrEqual(4);
    handle.dispose();
  });
});
