This folder contains the source assets and generated bundle path for the CAST macOS launcher.

- `npm run build:launcher` builds `launcher/build/CAST.app`
- `npm run install:launcher` copies that app into `~/Applications/CAST.app`

The launcher starts the local CAST server if needed and opens the app in the default browser.
