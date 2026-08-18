// @vitest-environment jsdom
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
    slot.lifecycle.unmount();
  });
});
