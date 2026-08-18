// @vitest-environment jsdom
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { DEFAULT_CONFIG } from "./domain";

describe("Chime settings UI", () => {
  it("renders playback, events, and project muting", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const slot = renderSlot(app.settingsSections[0]!, {}, {
      rpc: {
        getConfig: () => ({
          config: DEFAULT_CONFIG,
          projects: [{ id: "project-1", name: "Example project" }],
          serverPlaybackAvailable: true,
        }),
        updateConfig: (config) => ({ config }),
        previewServer: () => ({ ok: true, error: null }),
      },
    });

    expect(await slot.findByText("Playback")).toBeTruthy();
    expect(await slot.findByText("Turn completed")).toBeTruthy();
    expect(await slot.findByText("Example project")).toBeTruthy();

    const themeSelect = slot.getByLabelText("Sound theme") as HTMLSelectElement;
    expect(themeSelect.value).toBe("calm");
    fireEvent.change(themeSelect, { target: { value: "glass" } });
    expect(themeSelect.value).toBe("glass");

    const completedSound = slot.getByLabelText("Turn completed sound") as HTMLSelectElement;
    fireEvent.change(completedSound, { target: { value: "wood-resolve" } });
    expect(themeSelect.value).toBe("custom");
    slot.lifecycle.unmount();
  });
});
