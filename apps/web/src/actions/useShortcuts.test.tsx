import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
