import { useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import {
  DEFAULT_CONFIG,
  EVENT_KINDS,
  EVENT_LABELS,
  SOUND_IDS,
  SOUND_LABELS,
  type ChimeConfig,
  type EventKind,
  type SoundId,
} from "./domain";
import { audioActivationStatus, playClientSound, startAudioClient } from "./client-audio";
import { Button } from "./components/ui/button";
import "./app.css";

interface ProjectOption {
  id: string;
  name: string;
}

function Settings() {
  const rpc = useRpc<typeof rpcContract>();
  const [config, setConfig] = useState<ChimeConfig | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [status, setStatus] = useState("Loading settings…");
  const [audioStatus, setAudioStatus] = useState(audioActivationStatus());

  useEffect(() => {
    let live = true;
    void rpc.call("getConfig").then((result) => {
      if (!live) return;
      setConfig(result.config);
      setProjects(result.projects);
      setServerAvailable(result.serverPlaybackAvailable);
      setStatus("");
    }).catch((error: unknown) => {
      if (live) setStatus(error instanceof Error ? error.message : String(error));
    });
    return () => { live = false; };
  }, [rpc]);

  if (!config) return <p className="chime-muted">{status}</p>;

  const patchEvent = (kind: EventKind, patch: { enabled?: boolean; sound?: SoundId }) => {
    setConfig((current) => current && ({
      ...current,
      eventEnabled: { ...current.eventEnabled, ...(patch.enabled === undefined ? {} : { [kind]: patch.enabled }) },
      eventSounds: { ...current.eventSounds, ...(patch.sound === undefined ? {} : { [kind]: patch.sound }) },
    }));
  };

  const save = async () => {
    setStatus("Saving…");
    try {
      const result = await rpc.call("updateConfig", config);
      setConfig(result.config);
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const preview = async (soundId: SoundId) => {
    if (config.deliveryMode === "server") {
      const result = await rpc.call("previewServer", { soundId });
      setStatus(result.ok ? "Played on the server" : result.error ?? "Playback failed");
      return;
    }
    try {
      await playClientSound("chime", soundId, config.volume);
      setAudioStatus("active");
      setStatus("Client audio enabled");
    } catch {
      setAudioStatus("blocked");
      setStatus("The browser blocked audio. Click this button again after interacting with the page.");
    }
  };

  return (
    <div className="chime-settings">
      <section className="chime-card">
        <div>
          <h3>Playback</h3>
          <p>Short, local sounds for AI turn and attention events.</p>
        </div>
        <label className="chime-row">
          <span>Enable Chime</span>
          <input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />
        </label>
        <label className="chime-stack">
          <span>Delivery</span>
          <select value={config.deliveryMode} onChange={(event) => setConfig({ ...config, deliveryMode: event.target.value as ChimeConfig["deliveryMode"] })}>
            <option value="client">This browser or bb window</option>
            <option value="server" disabled={!serverAvailable}>Server audio {serverAvailable ? "(macOS)" : "(unavailable)"}</option>
          </select>
        </label>
        <label className="chime-stack">
          <span>Master volume · {Math.round(config.volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" value={config.volume} onChange={(event) => setConfig({ ...config, volume: Number(event.target.value) })} />
        </label>
        <label className="chime-row">
          <span>Mute the visible thread</span>
          <input type="checkbox" checked={config.muteVisibleThread} onChange={(event) => setConfig({ ...config, muteVisibleThread: event.target.checked })} />
        </label>
        <div className="chime-actions">
          <Button type="button" variant="outline" onClick={() => void preview(config.eventSounds.completed)}>
            Enable and test sounds
          </Button>
          <span className="chime-muted">Client audio: {audioStatus}</span>
        </div>
      </section>

      <section className="chime-card">
        <div>
          <h3>Events</h3>
          <p>Choose which transitions sound and the tone used for each.</p>
        </div>
        <div className="chime-events">
          {EVENT_KINDS.map((kind) => (
            <div className="chime-event" key={kind}>
              <label>
                <input type="checkbox" checked={config.eventEnabled[kind]} onChange={(event) => patchEvent(kind, { enabled: event.target.checked })} />
                <span>{EVENT_LABELS[kind]}</span>
              </label>
              <select aria-label={`${EVENT_LABELS[kind]} sound`} value={config.eventSounds[kind]} onChange={(event) => patchEvent(kind, { sound: event.target.value as SoundId })}>
                {SOUND_IDS.map((soundId) => <option key={soundId} value={soundId}>{SOUND_LABELS[soundId]}</option>)}
              </select>
              <Button type="button" size="sm" variant="ghost" onClick={() => void preview(config.eventSounds[kind])}>Preview</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="chime-card">
        <div>
          <h3>Muted projects</h3>
          <p>New projects remain audible until muted here.</p>
        </div>
        {projects.length === 0 ? <p className="chime-muted">No projects found.</p> : projects.map((project) => (
          <label className="chime-row" key={project.id}>
            <span>{project.name}</span>
            <input
              type="checkbox"
              checked={config.mutedProjectIds.includes(project.id)}
              onChange={(event) => setConfig({
                ...config,
                mutedProjectIds: event.target.checked
                  ? [...config.mutedProjectIds, project.id]
                  : config.mutedProjectIds.filter((id) => id !== project.id),
              })}
            />
          </label>
        ))}
      </section>

      <div className="chime-savebar">
        <span className="chime-muted" role="status">{status}</span>
        <Button type="button" onClick={() => void save()}>Save settings</Button>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "audio-client",
    mount({ pluginId, signal }) {
      return startAudioClient(pluginId, signal);
    },
  });
  app.slots.settingsSection({
    id: "chime-settings",
    title: "Chime settings",
    description: "Control notification sounds without sending message content or analytics.",
    component: Settings,
  });
});
