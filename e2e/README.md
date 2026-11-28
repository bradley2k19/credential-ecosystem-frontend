# Browser tests

## Notifications, corrections and student editing

`notifications-corrections.spec.ts` checks the notification bell (its count; polling every 2 minutes, paused
while the tab is hidden and after 10 minutes without input, with a check on focus; and its panel), both
notification pages, the student's correction request dialog and status, the
student's notification preference, the institution's approve and reject flow, the prefilled reissue form, the
"Now revoke the original certificate" prompt, and the student edit dialog.

Every API call is answered by a mock inside the browser, so no backend, database or wallet is needed. Start the
frontend (`npm run dev`, or `npm run build` then `npm start`), then from this folder:

```bash
EDITOR_SWEEP_BASE_URL=http://localhost:3000 npm run test:notifications
```

## Template editor sweep

`template-editor-sweep.spec.ts` opens the template editor from a starter and changes every control in all nine
settings sections through every option (or both ends of its range), using real mouse and keyboard input. It runs
twice: with the very long sample name and three signatories, and with the very long name and no signatories.

After every change it checks that:

- there are no console errors and no uncaught exceptions,
- the preview is drawn and not empty, and no "could not be drawn" message is shown,
- the window has not scrolled away from the editor and the page is no taller than the window,
- no section shows a validation problem,
- React committed at most 8 times, the editor rendered at most 8 times and the certificate renderer at most
  3 times (counted through a stand-in React DevTools hook, so it works on production builds too).

Nothing is saved. If the institution has fewer than three active signatories, the sweep adds sample ones to
the signatory list it reads, in the browser only.

### Run it

1. Start the backend, and start the frontend in the mode to test:
   - development: `npm run dev`
   - production: `npm run build` then `npm start`
2. In another terminal, from this folder, with an institution account:

   ```bash
   EDITOR_SWEEP_BASE_URL=http://localhost:3000 \
   EDITOR_SWEEP_EMAIL=institution@example.com \
   EDITOR_SWEEP_PASSWORD='the password' \
   npm run test:editor-sweep
   ```

   In PowerShell, set each variable first, e.g. `$env:EDITOR_SWEEP_EMAIL = "institution@example.com"`.

The test uses the installed Google Chrome. Without it, run `npx playwright install chromium` once and set
`EDITOR_SWEEP_BROWSER=chromium`.

### Options

| Variable | Default | Meaning |
|---|---|---|
| `EDITOR_SWEEP_BASE_URL` | `http://localhost:3000` | The running frontend |
| `EDITOR_SWEEP_EMAIL`, `EDITOR_SWEEP_PASSWORD` | | Institution account used to sign in |
| `EDITOR_SWEEP_TOKEN`, `EDITOR_SWEEP_USER` | | Instead of signing in: a session token and the stored user JSON |
| `EDITOR_SWEEP_STARTER` | `classic` | Starter layout to open (`classic`, `modern`, `minimal`) |
| `EDITOR_SWEEP_MAX_COMMITS` | `8` | Most React commits allowed per change |
| `EDITOR_SWEEP_MAX_EDITOR_RENDERS` | `8` | Most editor renders allowed per change |
| `EDITOR_SWEEP_MAX_RENDERER_RENDERS` | `3` | Most certificate renderer renders allowed per change |

Each run prints a table per control and attaches it (`editor-sweep-table.md`) with every change
(`editor-sweep-rows.json`) to the test results in `test-results/`.
