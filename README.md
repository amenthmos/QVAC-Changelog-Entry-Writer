# QVAC Changelog Entry Writer

Describe what changed in a release, and an on-device AI writes a formatted changelog entry in Added/Changed/Fixed style. No cloud call, no API key.

## Run

```bash
npm install
npm start
```

Then open http://localhost:32007

## Example

Input:

> added dark mode, fixed the crash on startup for Windows users, changed the default page size from 10 to 25

Output:

```
Added
- Added dark mode

Changed
- Changed default page size from 10 to 25

Fixed
- Fixed crash on Windows startup
```

Each comma-separated change is classified and polished individually (rather than rewritten as one big block) to keep the model from inventing extra, unrelated changes.

## QVAC SDK version

`@qvac/sdk` ^0.19.0 (see `package.json`).

## How it works

Built on [Tether's QVAC SDK](https://www.npmjs.com/package/@qvac/sdk) — all inference runs on-device, no cloud call, no API key. The app loads `LLAMA_3_2_1B_INST_Q4_0` locally with `loadModel()`, generates with `completion()` (streamed via `tokenStream`), and releases the model with `unloadModel()` on shutdown.

## License

MIT
