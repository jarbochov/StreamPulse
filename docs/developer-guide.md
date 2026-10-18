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
npm install
```

### Running the Development Server

```bash
npm start
```
The server will boot and listen at `http://localhost:3000`.

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

### Smoke Testing Editors

To verify browser editors and canvases in a headless browser environment:

```bash
npm run smoke:editors
```

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

## 4. Submitting Pull Requests

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Commit your changes with descriptive, atomic commit messages following conventional commits (`feat: ...`, `fix: ...`, `refactor: ...`).
3. Ensure all tests pass (`npm test`).
4. Push to your fork and submit a Pull Request to `main`.
