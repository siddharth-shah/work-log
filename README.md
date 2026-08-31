# Timebase

A lightweight, private project time tracker for the browser. Timebase tracks live work sessions, accepts manual entries across different days, keeps completed projects archived, and backs everything up as JSON.

## Features

- Multiple active projects with separate time totals
- One persistent live timer that survives page reloads
- Manual dated entries with optional notes
- Editable and deletable time entries
- Completed project archive with restore support
- Dashboard totals, recent work, and seven-day activity
- Versioned JSON export and validated import
- Responsive desktop and mobile layout
- Installable Manifest V3 Chrome extension

## Run locally

Requires a current version of Node.js.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

Create a production build with:

```bash
npm run build
```

## Install as a Chrome extension

Build the extension:

```bash
npm install
npm run build:extension
```

Then load it into Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` folder.
5. Pin Timebase from the Extensions menu. Clicking its toolbar icon opens a compact popup showing the running timer (or a quick-start list of your active projects); use "Open full dashboard" in the popup to get the full tab view.

To create a ZIP suitable for uploading to the Chrome Web Store:

```bash
npm run package:extension
```

This creates `timebase-chrome-extension.zip` in the project root. The web app and extension use separate browser-storage origins; move existing data between them with **Export JSON** and **Import JSON**.

## Data and privacy

All data is stored in your browser's `localStorage` under the key `project-time-tracker:data`. There is no account, server, database, analytics, or network sync. Clearing site data clears your projects, so use **Export JSON** periodically to create a backup.

Import accepts only Timebase's current versioned JSON format. A valid import shows a summary and asks for confirmation before replacing existing browser data; malformed or unsupported files are rejected without changing it.
