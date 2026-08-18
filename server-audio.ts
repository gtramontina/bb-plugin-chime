import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SoundId } from "./domain";

function soundPath(soundId: SoundId): string {
  const sourcePath = fileURLToPath(new URL(`./assets/sounds/${soundId}.wav`, import.meta.url));
  if (existsSync(sourcePath)) return sourcePath;
  return fileURLToPath(new URL(`../assets/sounds/${soundId}.wav`, import.meta.url));
}
export function isServerPlaybackAvailable(): boolean {
  return process.platform === "darwin" && existsSync("/usr/bin/afplay");
}

export function readSoundAsset(soundId: SoundId): Buffer {
  return readFileSync(soundPath(soundId));
}

export function playServerSound(soundId: SoundId, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/afplay", ["-v", String(volume), soundPath(soundId)], {
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`afplay exited ${code}`)));
  });
}
