// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import type { SeedEntry } from "../domain/seedvault/SeedVault";
import { InMemorySeedVaultStore } from "../infrastructure/persistence/InMemorySeedVaultStore";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { LobbyController } from "../application/LobbyController";
import type { LoopbackSession } from "../application/LoopbackSession";
import { createLocalizer } from "./i18n/strings";
import { LobbyView } from "./LobbyView";

const flush = () => new Promise((r) => setTimeout(r, 0));

function seed(overrides: Partial<SeedEntry> = {}): SeedEntry {
  return { id: "s1", seed: 42, name: "Home", createdAt: 100, ...overrides };
}

async function build(onJoinByCode?: (code: string) => Promise<boolean>) {
  const worlds = new InMemoryWorldSaveStore();
  const seeds = new InMemorySeedVaultStore();
  await seeds.add(seed());
  let n = 0;
  const controller = new LobbyController(worlds, seeds, {
    clock: () => 1000,
    idFactory: () => `w${++n}`,
  });
  const sessions: LoopbackSession[] = [];
  let backs = 0;
  const el = LobbyView(
    controller,
    createLocalizer("en"),
    (s) => sessions.push(s),
    () => backs++,
    onJoinByCode,
  );
  document.body.appendChild(el);
  await flush();
  return { controller, el, sessions, backCount: () => backs };
}

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found as HTMLButtonElement;
}

describe("LobbyView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows an empty-state message when no worlds are hosted", async () => {
    const { el } = await build();
    expect(el.textContent).toContain("No worlds yet");
    expect(el.querySelectorAll(".laas-world-row")).toHaveLength(0);
  });

  // E8.6: "play together" surface — panel emblem/heading treatment
  it("renders the heading behind a panel emblem, plus a play-together subtitle", async () => {
    const { el } = await build();
    expect(el.querySelector(".lw-panel-title-wrap h1")?.textContent).toBe("Online worlds");
    expect(el.querySelector(".lw-panel-title-wrap .lw-panel-emblem")).toBeTruthy();
    expect(el.querySelector(".laas-lobby-subtitle")?.textContent).toContain("Play together");
  });

  it("has a Back button wired to the back handler", async () => {
    const { el, backCount } = await build();
    buttonByText(el, "Back").click();
    expect(backCount()).toBe(1);
  });

  it("hosts from a saved seed and the world becomes joinable", async () => {
    const { el, sessions } = await build();

    buttonByText(el, "Host").click();
    await flush();
    // seed picker offers the saved seed
    const seedButton = buttonByText(el, "Host with Home");
    seedButton.click();
    await flush();

    const rows = el.querySelectorAll(".laas-world-row");
    expect(rows).toHaveLength(1);
    expect(buttonByText(el, "Join")).toBeTruthy();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mode).toBe("loopback");
  });

  describe("join by code", () => {
    function codeInput(el: HTMLElement): HTMLInputElement {
      const input = el.querySelector<HTMLInputElement>(".laas-code-input");
      if (!input) throw new Error("no room-code input");
      return input;
    }
    const statusOf = (el: HTMLElement): string =>
      el.querySelector(".laas-code-status")?.textContent ?? "";

    it("renders no code input when the host app wires no handler", async () => {
      const { el } = await build();
      expect(el.querySelector(".laas-code-input")).toBeNull();
    });

    it("passes a valid code (normalized uppercase) to onJoinByCode", async () => {
      const codes: string[] = [];
      const { el } = await build((code) => {
        codes.push(code);
        return Promise.resolve(true);
      });
      codeInput(el).value = "abcd2345";
      buttonByText(el, "Join with code").click();
      await flush();
      expect(codes).toEqual(["ABCD2345"]);
    });

    it("rejects a malformed code with an aria-live error and no callback", async () => {
      const codes: string[] = [];
      const { el } = await build((code) => {
        codes.push(code);
        return Promise.resolve(true);
      });
      codeInput(el).value = "nope";
      buttonByText(el, "Join with code").click();
      await flush();
      expect(codes).toEqual([]);
      const status = el.querySelector(".laas-code-status");
      expect(status?.getAttribute("aria-live")).toBe("polite");
      expect(statusOf(el)).toContain("8 letters");
    });

    it("shows connecting while pending, then the failure message on false", async () => {
      let resolve!: (v: boolean) => void;
      const { el } = await build(() => new Promise<boolean>((r) => (resolve = r)));
      codeInput(el).value = "ABCD2345";
      const button = buttonByText(el, "Join with code");
      button.click();
      await flush();
      expect(statusOf(el)).toContain("Connecting");
      expect(button.disabled).toBe(true);

      resolve(false);
      await flush();
      expect(statusOf(el)).toContain("Couldn't reach the host");
      expect(button.disabled).toBe(false);
    });
  });

  it("joins a hosted world and reports the session", async () => {
    const { el, sessions } = await build();
    buttonByText(el, "Host").click();
    await flush();
    buttonByText(el, "Host with Home").click();
    await flush();
    sessions.length = 0;

    buttonByText(el, "Join").click();
    await flush();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].worldId).toBe("w1");
    expect(sessions[0].mode).toBe("loopback");
  });
});
