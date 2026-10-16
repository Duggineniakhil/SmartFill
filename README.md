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

- **Auto-Learning:** Fill a form once, and SmartFill remembers it when you submit. Known field types
  (name, email, phone, address, education, company, job title, experience, notice period, CTC, socials, …)
  carry over to any site; answers to other questions are remembered by their label and refilled where
  the same question appears again. Passwords, OTPs, card/bank/ID numbers, search boxes and login forms are never learned.
- **Instant Autofill:** One-click to populate applications, signups, and profiles.
- **100% Local Privacy:** Zero cloud dependency. Your data never leaves your device and is stored securely in `chrome.storage.local`.
- **Modern Interface:** Built with React, Tailwind CSS, and shadcn-ui.

## Getting Started

Follow these steps to set up the project locally for development.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone the repository and install dependencies:**
   ```sh
   git clone https://github.com/Duggineniakhil/SmartFill.git
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
   This compiles the content scripts and popup into the checked-in `.js` files under `extension/`.
   `npm run package:extension` also rebuilds `public/SmartFill.zip`, the download served by the landing page.

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `extension` folder (or the unzipped `SmartFill.zip`).

### Testing

- `npm test` runs the unit tests (Vitest + jsdom).
- `npm run test:e2e` loads the unpacked extension into Microsoft Edge and checks learning, autofill,
  iframes, the popup and "Fill this page" end to end. Set `SMARTFILL_BROWSER=chromium` to use
  Playwright's Chromium instead (branded Chrome 137+ no longer loads unpacked extensions from the command line).

## Project Structure

- `src/` - Contains the React source code.
  - `components/` - Reusable UI components (shadcn-ui).
  - `pages/` - React Router pages (Landing, Profile Viewer, Settings).
  - `services/storage/` - `chrome.storage.local` abstraction layer.
  - `contexts/` - React Context providers (e.g., AuthContext for profile data).
- `extension/` - Contains Chrome extension background scripts and content scripts.

## Roadmap

- [x] Local profile storage
- [x] Chrome extension integration
- [ ] Smart field detection
- [ ] Resume parsing
- [ ] Multiple profiles
- [ ] Import / Export profiles
- [ ] AI-powered field matching
- [ ] Cloud sync

## Privacy & Architecture

SmartFill was refactored to be a completely offline extension. There is no backend, no database, and no authentication provider. All user data and preferences are saved locally on the user's machine utilizing the `chrome.storage.local` API.

## License

This project is licensed under the MIT License.
