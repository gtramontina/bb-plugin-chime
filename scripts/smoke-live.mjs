const baseUrl = process.env.CHIME_BB_BASE_URL ?? "http://127.0.0.1:38886";
const pluginUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/plugins/chime/http`;
const headers = { origin: new URL(baseUrl).origin };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presenceResponse = await fetch(`${pluginUrl}/presence?client=live-smoke&visibleThread=`, { headers });
assert(presenceResponse.status === 204, `presence endpoint returned ${presenceResponse.status}`);

const soundResponse = await fetch(`${pluginUrl}/sound-warm-resolve`, { headers });
assert(soundResponse.ok, `sound endpoint returned ${soundResponse.status}`);
assert(soundResponse.headers.get("content-type") === "audio/wav", "sound endpoint is not audio/wav");
const sound = new Uint8Array(await soundResponse.arrayBuffer());
const signature = new TextDecoder().decode(sound.slice(0, 4));
const format = new TextDecoder().decode(sound.slice(8, 12));
assert(signature === "RIFF" && format === "WAVE", "sound asset is not a RIFF/WAVE file");

console.log(`Chime live smoke passed at ${baseUrl}: ${sound.length} byte WAV.`);
