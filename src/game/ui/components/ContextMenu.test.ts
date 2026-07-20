// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemAction } from "../../domain/ui/ItemActions";
import { createLocalizer } from "../i18n/strings";
import { attachContextMenu } from "./ContextMenu";

const ACTIONS: readonly ItemAction[] = [
  { id: "split", labelKey: "contextMenu.action.split", enabled: true },
  { id: "drop", labelKey: "contextMenu.action.drop", enabled: true },
  { id: "info", labelKey: "contextMenu.action.info", enabled: false },
];

function mountAnchor(): HTMLButtonElement {
  const anchor = document.createElement("button");
  anchor.type = "button";
  anchor.textContent = "slot";
  document.body.appendChild(anchor);
  return anchor;
}

describe("ContextMenu", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders one menuitem per action, hidden until opened", () => {
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    const menuEl = document.querySelector('[role="menu"]');
    expect(menuEl).not.toBeNull();
    expect(menuEl?.getAttribute("aria-label")).toBe("Item actions");
    const items = document.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(3);
    expect((menuEl as HTMLElement).hidden).toBe(true);
    expect(menu.isOpen).toBe(false);
    menu.dispose();
  });

  it("empty action list: no menu is built, contextmenu is a silent no-op", () => {
    const anchor = mountAnchor();
    const onSelect = vi.fn();
    const menu = attachContextMenu(anchor, {
      actions: [],
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect,
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    anchor.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menu.isOpen).toBe(false);
    // no menu exists, so the anchor makes no popup claim either
    expect(anchor.hasAttribute("aria-haspopup")).toBe(false);
    menu.dispose();
  });

  it("marks the anchor aria-haspopup=menu and toggles aria-expanded with open state", () => {
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    expect(anchor.getAttribute("aria-haspopup")).toBe("menu");
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    anchor.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    menu.dispose();
  });

  it("dispose clears the aria-haspopup/aria-expanded claim from the anchor", () => {
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    menu.dispose();
    expect(anchor.hasAttribute("aria-haspopup")).toBe(false);
    expect(anchor.hasAttribute("aria-expanded")).toBe(false);
  });

  it("right-click opens the menu and focuses the first enabled item", () => {
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    anchor.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );
    expect(menu.isOpen).toBe(true);
    const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0]); // "split" is the first enabled action
    menu.dispose();
  });

  it("Shift+F10 on the anchor opens the menu (keyboard equivalent of right-click)", () => {
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    anchor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(menu.isOpen).toBe(true);
    menu.dispose();
  });

  it("a touch long-press (~500ms) opens the menu at the touch point", () => {
    vi.useFakeTimers();
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    anchor.dispatchEvent(
      Object.assign(new Event("touchstart", { bubbles: true, cancelable: true }), {
        touches: [{ clientX: 10, clientY: 20 }],
      }),
    );
    expect(menu.isOpen).toBe(false);
    vi.advanceTimersByTime(500);
    expect(menu.isOpen).toBe(true);
    menu.dispose();
    vi.useRealTimers();
  });

  it("releasing a touch before the long-press threshold cancels it", () => {
    vi.useFakeTimers();
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    anchor.dispatchEvent(
      Object.assign(new Event("touchstart", { bubbles: true, cancelable: true }), {
        touches: [{ clientX: 10, clientY: 20 }],
      }),
    );
    anchor.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(500);
    expect(menu.isOpen).toBe(false);
    menu.dispose();
    vi.useRealTimers();
  });

  it("moving beyond the tolerance during a long-press cancels it", () => {
    vi.useFakeTimers();
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    anchor.dispatchEvent(
      Object.assign(new Event("touchstart", { bubbles: true, cancelable: true }), {
        touches: [{ clientX: 10, clientY: 20 }],
      }),
    );
    anchor.dispatchEvent(
      Object.assign(new Event("touchmove", { bubbles: true, cancelable: true }), {
        touches: [{ clientX: 100, clientY: 100 }],
      }),
    );
    vi.advanceTimersByTime(500);
    expect(menu.isOpen).toBe(false);
    menu.dispose();
    vi.useRealTimers();
  });

  describe("once open", () => {
    let anchor: HTMLButtonElement;
    let onSelect: ReturnType<typeof vi.fn>;
    let menu: ReturnType<typeof attachContextMenu>;

    beforeEach(() => {
      anchor = mountAnchor();
      onSelect = vi.fn();
      menu = attachContextMenu(anchor, {
        actions: ACTIONS,
        loc: createLocalizer("en"),
        ariaLabel: "Item actions",
        onSelect,
      });
      anchor.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    afterEach(() => menu.dispose());

    it("ArrowDown/ArrowUp move the roving cursor, wrapping at the ends", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      expect(document.activeElement).toBe(items[0]);
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(items[1]);
      items[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(items[2]);
      items[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(items[0]); // wraps
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(items[2]); // wraps backward
    });

    it("Home/End jump to the first/last item", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(items[2]);
      items[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(items[0]);
    });

    it("Enter on the focused item selects it, closes the menu, and returns focus to the anchor", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      expect(onSelect).toHaveBeenCalledWith("split");
      expect(menu.isOpen).toBe(false);
      expect(document.activeElement).toBe(anchor);
    });

    it("Enter on a disabled item is a no-op — the menu stays open, nothing selected", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      items[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      expect(onSelect).not.toHaveBeenCalled();
      expect(menu.isOpen).toBe(true);
    });

    it("a mouse click on an enabled item selects it the same way", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[1]!.click();
      expect(onSelect).toHaveBeenCalledWith("drop");
      expect(menu.isOpen).toBe(false);
    });

    it("Escape closes the menu and returns focus to the anchor", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(menu.isOpen).toBe(false);
      expect(document.activeElement).toBe(anchor);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("an outside pointerdown closes the menu", () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
      expect(menu.isOpen).toBe(false);
    });

    it("disabled items carry aria-disabled", () => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      expect(items[0]!.getAttribute("aria-disabled")).toBe("false");
      expect(items[2]!.getAttribute("aria-disabled")).toBe("true");
    });
  });

  it("dispose removes the menu from the DOM and stops listening", () => {
    const anchor = mountAnchor();
    const menu = attachContextMenu(anchor, {
      actions: ACTIONS,
      loc: createLocalizer("en"),
      ariaLabel: "Item actions",
      onSelect: vi.fn(),
    });
    menu.dispose();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    anchor.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
