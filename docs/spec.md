# Chime product specification

Chime is a polished, publishable bb plugin, installed locally first and suitable for later marketplace distribution.

## Required behavior

1. Play calm, short, non-verbal sounds for every AI turn start and completion.
2. Play more prominent sounds when a thread waits for a user question, requests approval, or fails.
3. Detect manual cancellation on a best-effort basis and fall back to the completion sound when it cannot be distinguished.
4. Cover all threads by default, including visible and background threads.
5. Make every event independently toggleable and allow a built-in sound to be selected per event.
6. Provide master enable and volume controls, visible-thread muting, project muting, and sound previews.
7. Treat project muting as a denylist: new projects are audible by default.
8. Coalesce notification storms within one second, with questions, approvals, and failures taking priority over routine sounds.
9. Discard events older than five seconds rather than replaying stale sounds after reconnect.

## Playback

1. Default to client-local playback in bb desktop windows and browser/remote clients.
2. Elect one audible client per browser origin on a best-effort basis.
3. Surface browser autoplay activation state and provide an explicit enable/test action.
4. Offer optional server playback on macOS when `/usr/bin/afplay` is available; report it unavailable elsewhere.
5. Bundle small, original WAV files generated deterministically in the repository.

## Privacy and persistence

1. Notification payloads contain only event kind, thread/project identifiers, optional interaction ID, and timestamp. Cursor and configuration data may accompany notifications in the transport envelope.
2. Do not include prompts, responses, or error text.
3. Do not send telemetry.
4. Persist only configuration and muted project IDs. Event queues and deduplication state remain short-lived and in memory.

## Delivery quality

1. Use the name Chime, package name `bb-plugin-chime`, plugin-owned bell branding, and the MIT license.
2. Include backend and frontend unit tests, typechecking, a successful plugin build, local path installation, and live smoke tests.
3. Document browser autoplay, per-origin coordination, server playback location, and heuristic cancellation detection.
