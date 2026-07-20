// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("renders a labelled text input, label linked via for/id", () => {
    const field = Field({ label: "Room code" });
    expect(field.input.tagName).toBe("INPUT");
    expect(field.input.type).toBe("text");
    const label = field.root.querySelector("label");
    expect(label?.textContent).toBe("Room code");
    expect(label?.htmlFor).toBe(field.input.id);
  });

  it("supports a visually-hidden label while keeping the accessible name", () => {
    const field = Field({ label: "Chat message", labelVisuallyHidden: true });
    const label = field.root.querySelector("label");
    expect(label?.classList.contains("lw-sr-only")).toBe(true);
    expect(label?.htmlFor).toBe(field.input.id);
  });

  it("applies placeholder, initial value, and maxLength", () => {
    const field = Field({ label: "Name", placeholder: "Enter name", value: "Alice", maxLength: 24 });
    expect(field.input.placeholder).toBe("Enter name");
    expect(field.input.value).toBe("Alice");
    expect(field.input.maxLength).toBe(24);
  });

  it("shows a hint and wires it into aria-describedby", () => {
    const field = Field({ label: "Seed", hint: "Leave blank for random" });
    const hint = field.root.querySelector(".lw-field-hint");
    expect(hint?.textContent).toBe("Leave blank for random");
    expect(hint?.hasAttribute("hidden")).toBe(false);
    expect(field.input.getAttribute("aria-describedby")).toContain(hint!.id);
  });

  it("starts with no error shown", () => {
    const field = Field({ label: "Code" });
    const error = field.root.querySelector(".lw-field-error");
    expect(error?.hasAttribute("hidden")).toBe(true);
    expect(field.input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("setError shows a role=alert message and marks aria-invalid", () => {
    const field = Field({ label: "Code" });
    field.setError("That code doesn't look right");

    const error = field.root.querySelector(".lw-field-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe("That code doesn't look right");
    expect(error?.hasAttribute("hidden")).toBe(false);
    expect(field.input.getAttribute("aria-invalid")).toBe("true");
    expect(field.input.getAttribute("aria-describedby")).toContain(error!.id);
  });

  it("setError(undefined) clears a previously-set error", () => {
    const field = Field({ label: "Code", error: "bad" });
    field.setError(undefined);

    const error = field.root.querySelector(".lw-field-error");
    expect(error?.hasAttribute("hidden")).toBe(true);
    expect(field.input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("setValue updates the input", () => {
    const field = Field({ label: "Code" });
    field.setValue("ABCD1234");
    expect(field.input.value).toBe("ABCD1234");
  });

  it("fires onInput with the live value", () => {
    const onInput = vi.fn();
    const field = Field({ label: "Code", onInput });
    field.input.value = "hi";
    field.input.dispatchEvent(new Event("input"));
    expect(onInput).toHaveBeenCalledWith("hi");
  });

  it("is keyboard-focusable (native input semantics)", () => {
    const field = Field({ label: "Code" });
    document.body.appendChild(field.root);
    field.input.focus();
    expect(document.activeElement).toBe(field.input);
  });

  it("appends inputClassName alongside the base input class", () => {
    const field = Field({ label: "Chat message", inputClassName: "lw-chat-input" });
    expect(field.input.classList.contains("lw-field-input")).toBe(true);
    expect(field.input.classList.contains("lw-chat-input")).toBe(true);
  });

  it("assigns each instance a unique id", () => {
    const a = Field({ label: "A" });
    const b = Field({ label: "B" });
    expect(a.input.id).not.toBe(b.input.id);
  });
});
