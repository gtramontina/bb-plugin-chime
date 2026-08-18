import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sounds");
mkdirSync(root, { recursive: true });

const definitions = {
  "soft-rise": { duration: 0.34, notes: [[392, 0, 0.2], [523.25, 0.12, 0.22]], gain: 0.28 },
  "warm-resolve": { duration: 0.48, notes: [[440, 0, 0.24], [554.37, 0.1, 0.26], [659.25, 0.21, 0.26]], gain: 0.3 },
  "clear-question": { duration: 0.55, notes: [[523.25, 0, 0.22], [659.25, 0.26, 0.26]], gain: 0.36 },
  "gentle-knock": { duration: 0.42, notes: [[293.66, 0, 0.13], [349.23, 0.17, 0.13]], gain: 0.42, percussive: true },
  "low-warning": { duration: 0.58, notes: [[220, 0, 0.28], [185, 0.25, 0.29]], gain: 0.38 },
  "soft-stop": { duration: 0.4, notes: [[493.88, 0, 0.2], [369.99, 0.15, 0.23]], gain: 0.28 },
  "glass-rise": { duration: 0.42, notes: [[659.25, 0, 0.25], [880, 0.13, 0.28]], gain: 0.23, timbre: "glass" },
  "glass-resolve": { duration: 0.58, notes: [[587.33, 0, 0.3], [739.99, 0.11, 0.31], [987.77, 0.23, 0.33]], gain: 0.23, timbre: "glass" },
  "glass-question": { duration: 0.62, notes: [[698.46, 0, 0.3], [987.77, 0.29, 0.3]], gain: 0.27, timbre: "glass" },
  "glass-knock": { duration: 0.4, notes: [[830.61, 0, 0.16], [1108.73, 0.18, 0.17]], gain: 0.3, timbre: "glass", percussive: true },
  "glass-warning": { duration: 0.6, notes: [[440, 0, 0.3], [369.99, 0.27, 0.3]], gain: 0.27, timbre: "glass" },
  "glass-stop": { duration: 0.45, notes: [[783.99, 0, 0.25], [523.25, 0.16, 0.27]], gain: 0.23, timbre: "glass" },
  "wood-rise": { duration: 0.33, notes: [[261.63, 0, 0.12], [392, 0.13, 0.13]], gain: 0.48, timbre: "wood", percussive: true },
  "wood-resolve": { duration: 0.43, notes: [[293.66, 0, 0.13], [369.99, 0.13, 0.13], [440, 0.27, 0.13]], gain: 0.45, timbre: "wood", percussive: true },
  "wood-question": { duration: 0.5, notes: [[329.63, 0, 0.14], [493.88, 0.28, 0.14]], gain: 0.5, timbre: "wood", percussive: true },
  "wood-knock": { duration: 0.38, notes: [[220, 0, 0.11], [246.94, 0.17, 0.11]], gain: 0.56, timbre: "wood", percussive: true },
  "wood-warning": { duration: 0.52, notes: [[196, 0, 0.16], [164.81, 0.26, 0.16]], gain: 0.53, timbre: "wood", percussive: true },
  "wood-stop": { duration: 0.36, notes: [[349.23, 0, 0.13], [233.08, 0.16, 0.13]], gain: 0.47, timbre: "wood", percussive: true },
  "minimal-rise": { duration: 0.2, notes: [[523.25, 0, 0.18]], gain: 0.22, timbre: "minimal" },
  "minimal-resolve": { duration: 0.26, notes: [[587.33, 0, 0.11], [783.99, 0.12, 0.11]], gain: 0.23, timbre: "minimal" },
  "minimal-question": { duration: 0.32, notes: [[659.25, 0, 0.1], [880, 0.19, 0.1]], gain: 0.26, timbre: "minimal" },
  "minimal-knock": { duration: 0.22, notes: [[740, 0, 0.07], [740, 0.11, 0.07]], gain: 0.25, timbre: "minimal", percussive: true },
  "minimal-warning": { duration: 0.34, notes: [[246.94, 0, 0.12], [246.94, 0.18, 0.12]], gain: 0.28, timbre: "minimal" },
  "minimal-stop": { duration: 0.2, notes: [[392, 0, 0.16]], gain: 0.22, timbre: "minimal", percussive: true },
};

function envelope(time, start, duration, percussive) {
  const local = time - start;
  if (local < 0 || local >= duration) return 0;
  const attack = percussive ? 0.006 : 0.025;
  const release = percussive ? duration * 0.9 : 0.08;
  return Math.min(1, local / attack, (duration - local) / release) * Math.exp(-local * (percussive ? 12 : 2.5));
}

function toneSample(frequency, time, elapsedTime, timbre) {
  const phase = 2 * Math.PI * frequency * time;
  if (timbre === "glass") {
    const shimmer = Math.sin(2 * Math.PI * 4.5 * elapsedTime) * 0.018;
    return Math.sin(phase + shimmer)
      + Math.sin(phase * 2.01) * 0.23
      + Math.sin(phase * 3.98) * 0.09;
  }
  if (timbre === "wood") {
    return Math.sin(phase)
      + Math.sin(phase * 2.72) * 0.32
      + Math.sin(phase * 5.41) * 0.08;
  }
  if (timbre === "minimal") return Math.sin(phase);
  return Math.sin(phase) + Math.sin(phase * 2) * 0.12;
}

function wavBuffer(definition) {
  const sampleCount = Math.ceil(definition.duration * sampleRate);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    let sample = 0;
    for (const [frequency, start, duration] of definition.notes) {
      const env = envelope(time, start, duration, definition.percussive);
      sample += toneSample(frequency, time, time - start, definition.timbre) * env;
    }
    const fade = Math.min(1, (definition.duration - time) / 0.025);
    const value = Math.max(-1, Math.min(1, sample * definition.gain * fade));
    buffer.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
  }
  return buffer;
}

for (const [name, definition] of Object.entries(definitions)) {
  writeFileSync(resolve(root, `${name}.wav`), wavBuffer(definition));
}
