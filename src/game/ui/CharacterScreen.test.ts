// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { allocateCharacterTalent, allocateStatPoint, grantCharacterXp, newCharacter } from "../domain/character/Character";
import { xpForLevel } from "../domain/character/Leveling";
import { isOk } from "../domain/Result";
import { createLocalizer } from "./i18n/strings";
import { mountCharacterScreen } from "./CharacterScreen";

describe("mountCharacterScreen", () => {
  it("starts closed", () => {
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: newCharacter() });
    expect(screen.isOpen).toBe(false);
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(true);
    screen.dispose();
  });

  it("pressing C opens the overlay, releases pointer lock, and pauses input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const screen = mountCharacterScreen({
      loc: createLocalizer("en"),
      character: newCharacter(),
      setInputEnabled,
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    screen.dispose();
  });

  it("pressing C again closes it and restores input", () => {
    const setInputEnabled = vi.fn();
    const screen = mountCharacterScreen({
      loc: createLocalizer("en"),
      character: newCharacter(),
      setInputEnabled,
    });
    screen.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "C", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });

  it("Escape closes the overlay", () => {
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: newCharacter() });
    screen.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("does not toggle on 'c' typed into a focused text input", () => {
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: newCharacter() });
    screen.open();
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(screen.isOpen).toBe(true);
    input.remove();
    screen.dispose();
  });

  it("switches between the attributes and talents tabs", () => {
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: newCharacter() });
    screen.open();
    expect(document.querySelector(".lw-character-attributes")).toBeTruthy();
    const talentsTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Talents");
    talentsTab?.click();
    expect(document.querySelector(".lw-character-talents")).toBeTruthy();
    expect(document.querySelector(".lw-character-attributes")).toBeFalsy();
    screen.dispose();
  });

  it("shows level and unspent points, and disables Add point at zero points", () => {
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: newCharacter() });
    screen.open();
    expect(document.querySelector(".lw-character-level")?.textContent).toBe("Level 1");
    const addButtons = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Add point");
    expect(addButtons.length).toBeGreaterThan(0);
    for (const b of addButtons) expect((b as HTMLButtonElement).disabled).toBe(true);
    screen.dispose();
  });

  it("clicking Add point spends a point and raises the attribute, firing onCharacterChange", () => {
    const leveled = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const onCharacterChange = vi.fn();
    const screen = mountCharacterScreen({
      loc: createLocalizer("en"),
      character: leveled,
      onCharacterChange,
    });
    screen.open();
    const row = document.querySelector('[data-attribute="vigor"]');
    const addBtn = row?.querySelector("button:not([data-variant])") as HTMLButtonElement;
    addBtn.click();
    expect(onCharacterChange).toHaveBeenCalled();
    expect(screen.character.stats.attributes.vigor).toBe(1);
    expect(screen.character.stats.unspentPoints).toBe(0);
    screen.dispose();
  });

  it("Respec refunds every spent stat point for free", () => {
    let character = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const spent = allocateStatPoint(character, "vigor");
    if (!isOk(spent)) throw new Error("setup");
    character = spent.value;

    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character });
    screen.open();
    const respecBtn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Respec");
    respecBtn?.click();
    expect(screen.character.stats.attributes.vigor).toBe(0);
    expect(screen.character.stats.unspentPoints).toBe(1);
    screen.dispose();
  });

  it("learning a talent spends a talent point and marks the node allocated", () => {
    const leveled = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: leveled });
    screen.open();
    const talentsTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Talents");
    talentsTab?.click();
    const row = document.querySelector('[data-talent-id="strongArms"]');
    const learnBtn = row?.querySelector("button") as HTMLButtonElement;
    expect(learnBtn.disabled).toBe(false);
    learnBtn.click();
    expect(screen.character.talents.ranks.strongArms).toBe(1);
    const rowAfter = document.querySelector('[data-talent-id="strongArms"]');
    expect(rowAfter?.getAttribute("data-allocated")).toBe("true");
    screen.dispose();
  });

  it("a locked-by-level talent's Learn button is disabled and shows the level requirement", () => {
    const leveled = grantCharacterXp(newCharacter(), xpForLevel(1)).character; // level 2
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: leveled });
    screen.open();
    const talentsTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Talents");
    talentsTab?.click();
    const row = document.querySelector('[data-talent-id="toughSkin"]'); // requires level 3, prereq strongArms
    const learnBtn = row?.querySelector("button") as HTMLButtonElement;
    expect(learnBtn.disabled).toBe(true);
    expect(row?.textContent).toContain("Unlocks at level 3");
    screen.dispose();
  });

  it("Respec talents refunds every spent talent point for free", () => {
    let character = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const spent = allocateCharacterTalent(character, "strongArms");
    if (!isOk(spent)) throw new Error("setup");
    character = spent.value;

    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character });
    screen.open();
    const talentsTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Talents");
    talentsTab?.click();
    const respecBtn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Respec talents");
    respecBtn?.click();
    expect(screen.character.talents.ranks).toEqual({});
    expect(screen.character.talents.unspentPoints).toBe(1);
    screen.dispose();
  });

  it("setCharacter updates the open screen live without a remount", () => {
    const screen = mountCharacterScreen({ loc: createLocalizer("en"), character: newCharacter() });
    screen.open();
    const leveled = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    screen.setCharacter(leveled);
    expect(document.querySelector(".lw-character-level")?.textContent).toBe("Level 2");
    screen.dispose();
  });
});
