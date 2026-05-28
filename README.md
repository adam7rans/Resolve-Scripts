# CAST

CAST is a local-first web app for shaping long-form spoken video into stylized clips and exports.

It combines:

- transcript-driven clip finding and caption editing
- manual skip editing for long-form cleanup
- shader, gradient, dither, and de-rez visual treatment
- layered music arrangement with fades and cross-track timing
- local rendering and export with project data stored on your machine

## Run CAST

Development:

```bash
cd "/Users/adam/Documents/CAST"
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180).

Single-origin local app mode:

```bash
npm run build
npm run start:app
```

Open [http://127.0.0.1:4312](http://127.0.0.1:4312) by default.

## Projects and presets

By default, CAST stores local working data here:

- `projects/` — imported media, transcripts, exports, per-project settings
- `presets/` — tracked shareable look presets

You can override those roots with:

- `CAST_DATA_DIR`
- `CAST_PRESETS_DIR`

## Dock launcher

Build the macOS launcher bundle:

```bash
npm run build:launcher
```

Install it into `~/Applications`:

```bash
npm run install:launcher
```

That generates `CAST.app`, which you can pin to the Dock and use to start the local app directly.

## Privacy

This repo is configured so local project data stays untracked:

- `projects/`
- media imports
- transcript/caption outputs
- export artifacts
- local logs

Only code and tracked presets should be committed.

## Legacy Resolve scripts

The original Resolve-era scripts are preserved under:

`legacy/resolve-scripts/`

They are kept for reference only and are no longer part of the active CAST product surface.
