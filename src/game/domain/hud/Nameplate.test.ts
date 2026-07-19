import { describe, expect, it } from "vitest";
import {
  NAMEPLATE_MODES,
  factionFor,
  nameplateFor,
  shouldShowLifebar,
  shouldShowNameplate,
  type NameplateFaction,
  type NameplateMode,
  type NameplatePolicy,
} from "./Nameplate";

const ALL_ON: NameplatePolicy = {
  mode: "always",
  friendly: true,
  neutral: true,
  hostile: true,
  tamed: true,
  player: true,
};

const ALL_FACTIONS: readonly NameplateFaction[] = [
  "friendly",
  "neutral",
  "hostile",
  "tamed",
  "player",
];

describe("factionFor / nameplateFor", () => {
  it("reads a player as the player faction regardless of disposition", () => {
    expect(factionFor({ kind: "player", name: "Ari" })).toBe("player");
  });

  it("reads a wild creature by its disposition", () => {
    expect(factionFor({ kind: "creature", disposition: "hostile", name: "Wolf" })).toBe("hostile");
    expect(factionFor({ kind: "creature", disposition: "friendly", name: "Deer" })).toBe("friendly");
    expect(factionFor({ kind: "creature", disposition: "neutral", name: "Rabbit" })).toBe("neutral");
  });

  it("a tamed creature always reads as tamed, overriding a hostile disposition", () => {
    expect(
      factionFor({ kind: "creature", disposition: "hostile", tamed: true, name: "Wolf" }),
    ).toBe("tamed");
  });

  it("an untamed creature with no tamed flag keeps its wild disposition", () => {
    expect(
      factionFor({ kind: "creature", disposition: "hostile", tamed: false, name: "Wolf" }),
    ).toBe("hostile");
  });

  it("defaults a creature with no disposition to neutral (defensive default)", () => {
    expect(factionFor({ kind: "creature", name: "???" })).toBe("neutral");
  });

  it("nameplateFor carries the display name through untouched", () => {
    const spec = nameplateFor({ kind: "creature", disposition: "friendly", name: "Elk" });
    expect(spec).toEqual({ faction: "friendly", text: "Elk" });
  });
});

describe("shouldShowNameplate", () => {
  it("ships exactly the four documented modes", () => {
    expect(NAMEPLATE_MODES).toEqual(["always", "onHover", "inCombat", "off"]);
  });

  it("off mode hides every faction regardless of toggles or context", () => {
    for (const faction of ALL_FACTIONS) {
      for (const isHovered of [false, true]) {
        for (const inCombat of [false, true]) {
          expect(
            shouldShowNameplate({ ...ALL_ON, mode: "off" }, faction, { isHovered, inCombat }),
          ).toBe(false);
        }
      }
    }
  });

  it("a disabled faction stays hidden in every mode and every context", () => {
    const modes = NAMEPLATE_MODES.filter((m): m is NameplateMode => m !== "off");
    for (const mode of modes) {
      for (const faction of ALL_FACTIONS) {
        const policy: NameplatePolicy = { ...ALL_ON, mode, [faction]: false };
        for (const isHovered of [false, true]) {
          for (const inCombat of [false, true]) {
            expect(shouldShowNameplate(policy, faction, { isHovered, inCombat })).toBe(false);
          }
        }
      }
    }
  });

  it("always mode shows every enabled faction regardless of hover/combat", () => {
    for (const faction of ALL_FACTIONS) {
      for (const isHovered of [false, true]) {
        for (const inCombat of [false, true]) {
          expect(
            shouldShowNameplate({ ...ALL_ON, mode: "always" }, faction, { isHovered, inCombat }),
          ).toBe(true);
        }
      }
    }
  });

  it("onHover mode shows an enabled faction only while hovered, independent of combat", () => {
    for (const faction of ALL_FACTIONS) {
      for (const inCombat of [false, true]) {
        expect(
          shouldShowNameplate({ ...ALL_ON, mode: "onHover" }, faction, {
            isHovered: true,
            inCombat,
          }),
        ).toBe(true);
        expect(
          shouldShowNameplate({ ...ALL_ON, mode: "onHover" }, faction, {
            isHovered: false,
            inCombat,
          }),
        ).toBe(false);
      }
    }
  });

  it("inCombat mode shows an enabled faction only during combat, independent of hover", () => {
    for (const faction of ALL_FACTIONS) {
      for (const isHovered of [false, true]) {
        expect(
          shouldShowNameplate({ ...ALL_ON, mode: "inCombat" }, faction, {
            isHovered,
            inCombat: true,
          }),
        ).toBe(true);
        expect(
          shouldShowNameplate({ ...ALL_ON, mode: "inCombat" }, faction, {
            isHovered,
            inCombat: false,
          }),
        ).toBe(false);
      }
    }
  });
});

describe("shouldShowLifebar", () => {
  it("hides when the nameplate itself is hidden, even at low health", () => {
    expect(shouldShowLifebar(false, 0.1)).toBe(false);
  });

  it("hides when the nameplate is visible but the subject is at full health", () => {
    expect(shouldShowLifebar(true, 1)).toBe(false);
  });

  it("shows when the nameplate is visible and the subject is damaged", () => {
    expect(shouldShowLifebar(true, 0.99)).toBe(true);
    expect(shouldShowLifebar(true, 0)).toBe(true);
  });
});
