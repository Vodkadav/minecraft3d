import { describe, expect, it } from "vitest";
import { RARITY_TIERS } from "../theme/tokens";
import { rarityTierForItemTier } from "./ItemRarity";

describe("rarityTierForItemTier", () => {
  it("maps the five progression tiers onto the rarity scale in order", () => {
    expect(rarityTierForItemTier(0)).toBe("common");
    expect(rarityTierForItemTier(1)).toBe("uncommon");
    expect(rarityTierForItemTier(2)).toBe("rare");
    expect(rarityTierForItemTier(3)).toBe("epic");
    expect(rarityTierForItemTier(4)).toBe("legendary");
  });

  it("clamps tiers above the scale to legendary", () => {
    expect(rarityTierForItemTier(5)).toBe("legendary");
    expect(rarityTierForItemTier(99)).toBe("legendary");
  });

  it("clamps negative / non-finite tiers to common", () => {
    expect(rarityTierForItemTier(-1)).toBe("common");
    expect(rarityTierForItemTier(Number.NaN)).toBe("common");
  });

  it("only ever returns a value in the canonical tier list", () => {
    for (let t = -2; t <= 8; t++) {
      expect(RARITY_TIERS).toContain(rarityTierForItemTier(t));
    }
  });
});
