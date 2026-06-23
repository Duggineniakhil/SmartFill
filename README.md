<<<<<<< ours
<div align="center">
  <img src="src/assets/autoflow-icon.png" alt="SmartFill Logo" width="80" height="80" />

  # SmartFill

  **Smart form autofill that learns.** <br>
  *A privacy-first Chrome extension that automatically learns and fills your forms locally.*

  <br />

  ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
  ![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&logo=radix-ui&logoColor=white)
</div>

<br />

## Why SmartFill?

Users repeatedly enter the same information into job applications,
registration forms, and online profiles.

SmartFill learns commonly used information and automatically fills
future forms while keeping all data stored locally on the user's device.

## Features

- **Smart Field Detection:** Ports dashboard-tested alias matching and confidence scoring into the content script. Fields are classified as canonical keys with confidence scores.
- **Auto-Learning:** Fill a form once, and SmartFill remembers it.
- **Instant Autofill:** One-click to populate applications, signups, and profiles.
- **100% Local Privacy:** Zero cloud dependency. Your data never leaves your device and is stored securely in `chrome.storage.local`.
- **Modern Interface**: Built with React, Tailwind CSS, and shadcn-ui.

## Getting Started

Follow these steps to set up the project locally for development.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone the repository and install dependencies:**
   ```sh
   git clone https://github.com/yourusername/SmartFill.git
   cd SmartFill
   npm install
   ```

2. **Run the development UI server:**
   ```sh
   npm run dev
   ```
   This will start the Vite dev server to view the dashboard and settings interface locally at `http://localhost:8080`.

3. **Build the Chrome Extension:**
   ```sh
   npm run build:extension
   ```
   This compiles the extension TypeScript content scripts into the extension directory.

### Loading the Extension in Chrome

1. Download `SmartFill.zip` from the dashboard.
2. Unzip it somewhere you’ll remember. You should see a folder containing `manifest.json`, `background/`, `content/`, `icons/`, and `popup/`.
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable **Developer mode** in the top right corner.
5. Click **Load unpacked** and select the *unzipped folder* (the one that contains `manifest.json`).

> **Note:** If you see “Manifest file is missing or unreadable,” you probably selected the wrong folder — make sure it’s the folder that directly contains `manifest.json`, not the Downloads folder or the project root.

## Project Structure

- `src/` - Contains the React source code.
  - `components/` - Reusable UI components (shadcn-ui).
  - `pages/` - React Router pages (Landing, Profile Viewer, Settings).
  - `services/storage/` - `chrome.storage.local` abstraction layer.
  - `contexts/` - React Context providers (e.g., AuthContext for profile data).
- `extension/` - Contains Chrome extension files.
  - `content/detectFields.ts` — Smart field detection engine (`window.__SMARTFILL__`).
  - `content/autofill.ts` — Autofill engine with confidence thresholds and UI badges.
  - `background/` — Service worker.
  - `popup/` — Extension popup UI.
  - `manifest.json` — Chrome Extension manifest v3.

## Privacy & Architecture

SmartFill was refactored to be a completely offline extension. There is no backend, no database, and no authentication provider. All user data and preferences are saved locally on the user's machine utilizing the `chrome.storage.local` API.

## Roadmap

- [x] Local profile storage
- [x] Chrome extension integration
- [x] Smart field detection
- [x] Confidence-based autofill thresholds
- [ ] Resume parsing
- [ ] Multiple profiles
- [x] Import / Export profiles
- [ ] AI-powered field matching
- [ ] Cloud sync

## License

This project is licensed under the MIT License.
=======
# SmartFill

SmartFill is a privacy-first Chrome extension and local dashboard for learning and autofilling repeated form data. Fill a form once, and SmartFill stores recognized profile fields locally so future forms can be filled automatically or with a one-click suggestion.

The project contains two pieces:

- A Vite + React dashboard for viewing stored data, testing field detection, and managing settings.
- A Manifest V3 Chrome extension with content scripts, a background worker, and a popup UI.

## Features

- Smart field detection for common profile fields such as name, email, phone, address, university, degree, GPA, LinkedIn, GitHub, portfolio, skills, and resume links.
- Confidence-based autofill: high-confidence matches can be filled automatically, while lower-confidence matches show a small SmartFill badge.
- Auto-learning on form submit when recognized fields are present.
- Safe field filtering for passwords, OTPs, CVVs, card numbers, PINs, and other sensitive values.
- Local-only storage through `chrome.storage.local`, with `localStorage` fallback for the web dashboard during development.
- Import and export for profile data and settings.
- Dashboard field matcher tester for validating labels, placeholders, names, and IDs.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Radix UI / shadcn-style components
- Vitest
- Chrome Extension Manifest V3

## Requirements

- Node.js 18 or newer
- npm
- Chromium-based browser for extension testing, such as Chrome, Edge, Brave, or Arc

## Setup

```sh
npm install
```

Start the dashboard:

```sh
npm run dev
```

The Vite dev server runs on `http://localhost:8080`.

## Build

Build the React dashboard:

```sh
npm run build
```

Build the extension content scripts:

```sh
npm run build:extension
```

The extension build compiles TypeScript files in `extension/content/` into checked-in JavaScript files used by `extension/manifest.json`.

## Test And Lint

```sh
npm test
npm run lint
```

`npm run lint` currently completes with warnings from React Fast Refresh conventions and hook dependency guidance, but no lint errors.

## Load The Extension

1. Build the extension scripts with `npm run build:extension`.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `extension/` folder from this repository, the folder that directly contains `manifest.json`.

The public site can also download `public/SmartFill.zip`, which should be unzipped before loading through Chrome's Load unpacked flow.

## Project Structure

```text
src/
  components/        Shared UI, layout, profile visuals, and GridScan effect
  contexts/          Local profile/settings provider
  pages/             Landing page, dashboard, settings, and not-found route
  services/
    autofill/        Dashboard field matcher logic
    storage/         chrome.storage.local/localStorage wrapper
  test/              Vitest setup and tests

extension/
  manifest.json      Chrome extension manifest
  background/        Service worker
  content/           Field detection, autofill, and generated JS outputs
  popup/             Extension popup UI
  storage/           Chrome storage helpers
  icons/             Extension icons

public/
  SmartFill.zip      Downloadable extension package
```

## How SmartFill Works

The detection script collects labels, placeholders, ARIA text, names, IDs, and nearby question text from visible form controls. It normalizes those hints and compares them against canonical field aliases. Forbidden sensitive fields are ignored before matching.

On submit, SmartFill captures high-confidence values into a local profile. On future pages, it either fills high-confidence empty fields directly when auto-fill is enabled or displays a small badge for manual fill.

## Privacy

SmartFill has no backend requirement. Profile data and preferences stay on the user's device in `chrome.storage.local` when running as an extension. In the development dashboard, the same storage abstraction falls back to browser `localStorage`.

## Available Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - build the React app
- `npm run build:extension` - compile extension content scripts
- `npm run build:dev` - build the React app in development mode
- `npm run lint` - run ESLint
- `npm test` - run Vitest once
- `npm run test:watch` - run Vitest in watch mode
- `npm run preview` - preview the production build

## License

MIT
>>>>>>> theirs
