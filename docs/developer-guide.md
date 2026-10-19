# StreamPulse Developer & Contributor Guide

This guide covers setting up a local development environment, running tests, adhering to the project's design standards, and contributing code to StreamPulse.

---

## 1. Prerequisites & Environment Setup

- **Node.js**: Requires Node.js `>=22.12.0` (LTS recommended).
- **Git**: For version control.
- **Operating Systems**: macOS, Linux, and Windows 10/11 are fully supported.

### Clone and Install Dependencies

```bash
git clone https://github.com/jarbochov/StreamPulse.git
cd StreamPulse
npm run setup
# (Select profile 1 for lightweight server development, or profile 2 for full desktop app development)
```

### Running the Development Server

```bash
npm start
```
The server will boot and listen at `http://localhost:3000`.

### Running Desktop Development Mode

```bash
npm run desktop:dev
```

---

## 2. Code Quality & Test Pipeline

StreamPulse enforces strict code quality checks via ESLint (using ESLint Flat Config) and Node.js syntax verification.

### Run Full Test Suite

```bash
npm test
```
This runs:
1. `eslint server.js server/ scripts/ desktop/` (linting server, desktop wrapper, and tooling code).
2. `node --check` syntax validation across all server entrypoints, Electron desktop files, route controllers, and domain services.
3. `npm run test:regression`: isolated session/milestone, archive-cache, and save-failure checks; desktop lifecycle checks against temporary data; browser playback/alert and inactive-editor regressions; Game Plan refresh checks; and legacy/static URL smoke tests.

The browser regressions use Puppeteer's Chrome. If it is missing, run `npm run install:chrome` once. The regression suite starts isolated local fixtures; it does not require your production server or use your saved configuration/data. Browser exceptions and failed assertions return a nonzero exit status.

### Smoke Testing Editors

To verify browser editors and canvases in a headless browser environment:

```bash
npm run smoke:editors
```

This separate editor smoke check requires a running development server. Set `STREAMPULSE_URL` to use a non-default URL.

### Backend Lifecycle

`server.js` exports `startServer()`, `stopServer({ preserveSession })`, and `restartServer()`. Desktop startup awaits full backend initialization, not just a bound HTTP port. Stop cancels owned polling, countdown tickers, page rotation/takeovers, chatbot and alert timers, SSN reconnects, and WebSocket connections before releasing HTTP.

Restart preserves session data and restarts the desktop backend in-process without installing duplicate background timers. Explicit quit ends and archives the session. Saving errors are reported rather than followed by a success message or a session reset.

Milestone broadcast time uses observed live start/end bounds rather than the server's uptime. Lifetime message totals come from persistent statistics, which already include current-session messages.

The archive-cache regression uses 120 fictional sessions and asserts that warm category/milestone/dossier queries perform zero archive JSON reads, even after metadata and milestone refresh intervals expire. It also covers changed files, additions, deletions, restore invalidation, and repaired malformed archives. Its printed timing and compact-summary size are fixture measurements, not production CPU/RAM guarantees.

---

## 3. UI/UX Design System Standards

When contributing UI controls, views, or editors, all changes must strictly adhere to the following principles:

### Strict No-Emoji Policy
- **Never use raw unicode emojis** in UI controls, wizard options, buttons, tabs, headers, status badges, or overlay previews.
- Always use **crisp inline SVG icons** (viewBox `0 0 24 24`, 12–16px, `currentColor`) or approved icon font classes (`fa-solid`, `fa-brands`).
- For status indicators, use clean pill badges with low-opacity tinted backgrounds and subtle borders (e.g., `badge-shown`, `badge-test`, `badge-now`).

### Density & Clutter Control
- Group related controls inside structured sections (`F.section(...)` in editors) with clear, muted micro-headings (`font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted)`).
- Keep controls visually calm and spacious. Avoid wall-of-buttons or overwhelming lists of options on a single screen.

### State Persistence & Navigation Memory
- Always persist user view preferences (active tab, calendar vs list view, filter states like `hideUnmatched`, active period) in `localStorage` or URL search params so page reloads do not reset the streamer's context.

### Responsive Media & Cover Scaling
- Every widget and overlay displaying game artwork or alerts must provide responsive scaling controls:
  - `coverScale` (percentage or multiplier)
  - `coverFit` (`cover` [fill/crop], `contain` [letterboxed], `natural` [unconstrained])
  - Aspect ratio handling (`3/4`, `2/3`, `1/1`, `16/9`, etc.)

---

## 4. Documentation & GitHub Pages Workflow

StreamPulse maintains its official documentation at [jarbochov.github.io/StreamPulse](https://jarbochov.github.io/StreamPulse/). Keeping documentation in lockstep with the codebase is a mandatory development rule:

- **Document alongside code**: When adding, modifying, or refactoring features, overlays, APIs, or settings, always update the relevant guide in `docs/` in the same pull request or commit.
- **Changelog Maintenance**: Update both `CHANGELOG.md` and `docs/changelog.md` following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standards when releasing new features, enhancements, or bug fixes.
- **Sanitized Visuals**: Never commit screenshots containing real chatter names, broadcaster notes, or private channels. Always use the automated capture script to generate sanitized screenshots:
  ```bash
  node scripts/capture-screenshots.mjs
  ```
- **Automated Deployment**: GitHub Pages deploys automatically on every push to `main` via `.github/workflows/pages.yml`.

---

## 5. Submitting Pull Requests

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Commit your changes with descriptive, atomic commit messages following conventional commits (`feat: ...`, `fix: ...`, `refactor: ...`).
3. Ensure all tests pass (`npm test`).
4. Push to your fork and submit a Pull Request to `main`.
