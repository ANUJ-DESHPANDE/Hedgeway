# Trading workspace update

The app now opens directly into Markets, labelled Workspace in the navigation. The three primary destinations are Workspace, Portfolio and Research. More tools preserves access to the scanner, IPOs, strategy lab, journal, AI desk, overview and connections.

The workspace has a clickable watchlist, chart and research column. Selecting a watchlist entry switches the chart. Explain what I'm seeing opens a contextual AI dialog while preserving the chart selection. Source/connection details are collapsed for a configured AI provider in that dialog; the full AI desk remains available for longer sessions. Quotes, source timestamps and unavailable-data states remain real; no placeholder prices were introduced.

## Updating a local Windows installation

Stop the server with Ctrl+C in its PowerShell window, then run:

```powershell
git pull --ff-only
npm ci
npm run build
npm start
```

Open http://localhost:4100/#Markets. Existing .env and SQLite data are preserved.

## Importing an existing private connection file

The cloud workspace and a local checkout are separate installations. GitHub intentionally carries no credentials. If the owner has received a private `hedgeway-connections.env` file, save it in Downloads, stop the server, and run from the repository:

```powershell
npm run setup -- "$env:USERPROFILE\Downloads\hedgeway-connections.env"
npm start
```

The importer accepts only Upstox/Gemini provider settings and supported Gemini model names. It preserves the installation's encryption key, database and server settings, and never prints tokens. The file contains credentials: keep it private and delete the downloaded copy after import. It is ignored by Git if accidentally placed in the repository. Credentials already saved in the local database take precedence over environment variables; this import is intended for the fresh checkout described above.

No model billing, new subscriptions or paid fallbacks are enabled by the import. Provider quotas and credential expiry still apply.
