# VoltGuard dashboard redesign

Implemented 2026-10-02. The dashboard uses a restrained instrumentation layout with a forest-green navigation rail, warm neutral workspace, flat measurement strip, prominent signal chart, device inspector and event history.

## Design and behavior

- Inter for interface text and IBM Plex Mono for instrument values; fonts are bundled locally, with no runtime Google Fonts request.
- Compact Lucide icons, consistent borders and small corner radii, quieter chart colors and simplified battery estimates.
- One primary signal view, with click-to-inspect measurement cards and keyboard-accessible signal tabs. Remaining electrical signals stay visible below; battery views retain charge/health charts.
- Selectable 30/60/100-sample chart windows; exports include the retained readings as CSV (up to 100).
- Radix modal simulation settings and profile selection. Conditions publish through the existing backend path; no artificial telemetry is inserted into UI components.
- Active/recent event tabs include persisted recovery records. Device inspector shows real freshness, data source, MQTT status and socket status.
- Mobile navigation closes, scrolls to the requested section and moves focus to its heading. Dialog Escape returns focus to the trigger.
- Existing LIVE/RECONNECTING/OFFLINE states and backend-unavailable behavior are retained. All charts remain bounded and derived from validated telemetry.

## Prebuilt component sources

- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [Select](https://www.radix-ui.com/primitives/docs/components/select), [Tabs](https://www.radix-ui.com/primitives/docs/components/tabs), [Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip).
- Lucide React icons, locally installed through npm.
- Fontsource Inter and IBM Plex Mono, bundled with the application.

The existing Chart.js renderer and backend are retained. Library packages provide accessible control behavior; visual styling is tailored to VoltGuard.

## Verification

- PASS: 16 backend tests (14 unit + 2 integration) after dependency updates.
- PASS: production build; chart, React and Radix bundles are split for caching and smaller chunks.
- PASS: ESLint, Prettier check and dependency audit (zero reported vulnerabilities).
- PASS: five Chrome browser tests covering existing live pipeline behavior, faults/recovery, reconnection, unavailable REST, malformed socket packets, chart controls, CSV contents, simulation settings and mobile navigation.
- PASS: automated axe WCAG 2 A/AA and 2.1 AA checks of the normal battery dashboard and simulation dialog. Secondary text contrast was adjusted following the scan. This is automated coverage of those states, not a claim of complete manual accessibility certification.
- PASS: 30-second Chrome-attached smoke soak after the redesign, with bounded chart history and stable client count. The original pipeline's two 180-second soak runs remain documented in SOFTWARE_TEST_REPORT.md; they predate this redesign.
- Desktop and mobile screenshots inspected; overflow checks cover 320, 390, 768 and 1024 px widths.

## Files

Significant frontend changes: `src/App.jsx`, `src/styles.css`, `src/main.jsx`, `src/hooks/useTelemetry.js`, `src/components/SignalChart.jsx`, `src/components/Controls.jsx`, `src/format.js`, `test/dashboard.spec.js`, `vite.config.js`, `index.html`, `public/favicon.svg`, `package.json`.

Root changes: dependency manifests/lockfile, JSX-aware lint naming configuration, README and this report. No backend protocol, thresholds or storage changes were required for the redesign.

Screenshot artifacts: `test-results/dashboard-desktop.png`, `dashboard-mobile.png`, `professional-ac-desktop.png`, `professional-simulation.png`. Accessibility results are saved as JSON alongside them. Generated artifacts remain ignored.
