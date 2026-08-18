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
};

function envelope(time, start, duration, percussive) {
  const local = time - start;
  if (local < 0 || local >= duration) return 0;
  const attack = percussive ? 0.006 : 0.025;
  const release = percussive ? duration * 0.9 : 0.08;
  return Math.min(1, local / attack, (duration - local) / release) * Math.exp(-local * (percussive ? 12 : 2.5));
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
      sample += Math.sin(2 * Math.PI * frequency * time) * env;
      sample += Math.sin(2 * Math.PI * frequency * 2 * time) * env * 0.12;
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
