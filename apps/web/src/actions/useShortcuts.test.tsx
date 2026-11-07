import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "@lumacut/actions";
import { playerActions, type PlayerContext } from "./player.ts";
import { useShortcuts } from "./useShortcuts.ts";

function Harness({ ctx }: { ctx: PlayerContext }) {
  useShortcuts(playerActions, ctx);
  return (
    <div>
      <input aria-label="scrub" type="range" />
      <input aria-label="name" type="text" />
      <button type="button">Play</button>
    </div>
  );
}

function setup() {
  const services = {
    togglePlay: vi.fn(),
    stepFrames: vi.fn(),
    skipSeconds: vi.fn(),
    seekToStart: vi.fn(),
    seekToEnd: vi.fn(),
  };
  const ctx: PlayerContext = { playing: false, hasContent: true, services };
  const view = render(<Harness ctx={ctx} />);
  return { services, ...view };
}

afterEach(cleanup);

describe("useShortcuts", () => {
  it("runs bare-key shortcuts from the page body", () => {
    const { services } = setup();
    fireEvent.keyDown(document.body, { key: " " });
    expect(services.togglePlay).toHaveBeenCalledTimes(1);
  });

  it("keeps working while a range slider has focus (a slider isn't text entry)", () => {
    const { services, getByLabelText } = setup();
    const slider = getByLabelText("scrub");
    slider.focus();
    fireEvent.keyDown(slider, { key: " " });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(services.togglePlay).toHaveBeenCalledTimes(1);
    expect(services.stepFrames).toHaveBeenCalledWith(1);
  });

  it("ignores bare keys while typing in a text field", () => {
    const { services, getByLabelText } = setup();
    const field = getByLabelText("name");
    field.focus();
    fireEvent.keyDown(field, { key: " " });
    fireEvent.keyDown(field, { key: "ArrowLeft" });
    expect(services.togglePlay).not.toHaveBeenCalled();
    expect(services.stepFrames).not.toHaveBeenCalled();
  });

  it("leaves Space on a focused button to the button's own click (no double toggle)", () => {
    const { services, getByRole } = setup();
    const button = getByRole("button", { name: "Play" });
    button.focus();
    fireEvent.keyDown(button, { key: " " });
    expect(services.togglePlay).not.toHaveBeenCalled();
    // Other keys still work from a focused button.
    fireEvent.keyDown(button, { key: "ArrowRight" });
    expect(services.stepFrames).toHaveBeenCalledWith(1);
  });
});

describe("useShortcuts and text fields", () => {
  function Modal({ registry, hit }: { registry: ActionRegistry<null>; hit: (id: string) => void }) {
    useShortcuts(registry, null, (action) => {
      hit(action.id);
    });
    return <input aria-label="field" type="text" />;
  }
  const make = () => {
    const r = new ActionRegistry<null>();
    const base = {
      description: "Does something useful.",
      keywords: ["k"],
      category: "Edit",
      when: () => true,
      run: () => undefined,
    };
    r.register({ ...base, id: "history.undo", title: "Undo", shortcut: "Mod+Z" });
    r.register({ ...base, id: "clip.paste", title: "Paste", shortcut: "Mod+V" });
    r.register({ ...base, id: "library.upload", title: "Upload", shortcut: "Mod+U" });
    r.register({ ...base, id: "clip.split", title: "Split", shortcut: "S" });
    return r;
  };

  it("while typing: copy/paste/undo stay with the field, other Mod shortcuts still work, bare keys don't", () => {
    const hit = vi.fn();
    const { getByLabelText } = render(<Modal registry={make()} hit={hit} />);
    const field = getByLabelText("field");
    field.focus();
    fireEvent.keyDown(field, { key: "z", ctrlKey: true });
    fireEvent.keyDown(field, { key: "v", ctrlKey: true });
    fireEvent.keyDown(field, { key: "s" });
    expect(hit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "u", ctrlKey: true });
    expect(hit).toHaveBeenCalledWith("library.upload");
  });

  it("outside a field every shortcut runs", () => {
    const hit = vi.fn<(id: string) => void>();
    render(<Modal registry={make()} hit={hit} />);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "s" });
    expect(hit.mock.calls.map((c) => c[0])).toEqual(["history.undo", "clip.split"]);
  });
});
