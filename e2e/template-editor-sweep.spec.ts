import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { installRenderProbe } from "./renderProbe";

/**
 * Template editor sweep: opens the editor from a starter and changes every control in all nine settings sections
 * through every option (or both ends of its range), with real mouse and keyboard input. After each change it
 * checks: no console errors, no uncaught exceptions, the preview is drawn and not empty, the page has not
 * scrolled away from the editor, no validation problem appeared, and the number of React commits and component
 * renders stayed within small bounds. Nothing is saved. See e2e/README.md for how to run it.
 */

const STARTER = process.env.EDITOR_SWEEP_STARTER ?? "classic";
const MAX_COMMITS = Number(process.env.EDITOR_SWEEP_MAX_COMMITS ?? 8);
const MAX_EDITOR_RENDERS = Number(process.env.EDITOR_SWEEP_MAX_EDITOR_RENDERS ?? 8);
const MAX_RENDERER_RENDERS = Number(process.env.EDITOR_SWEEP_MAX_RENDERER_RENDERS ?? 3);
const SYNTHETIC_SIGNATORY_PREFIX = "00000000-0000-4000-8000-0000000000";

type Control =
  | { kind: "select"; label: string; options: string[] }
  | { kind: "radios"; legend: string; options: string[] }
  | { kind: "checkbox"; label: string }
  | { kind: "range"; label: string }
  | { kind: "number"; label: string; min: number; max: number }
  | { kind: "color"; label: string }
  | { kind: "text"; label: string; hex: boolean }
  | { kind: "font"; label: string }
  | { kind: "button"; label: string; index: number };

interface Row {
  section: string;
  control: string;
  change: string;
  commits: number;
  editorRenders: number;
  rendererRenders: number;
  consoleErrors: string[];
  pageErrors: string[];
  problems: string[];
}

const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

async function signIn(page: Page) {
  const email = process.env.EDITOR_SWEEP_EMAIL;
  const password = process.env.EDITOR_SWEEP_PASSWORD;
  const token = process.env.EDITOR_SWEEP_TOKEN;
  const user = process.env.EDITOR_SWEEP_USER;
  if (email && password) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/institution/dashboard", { timeout: 120_000 });
    return;
  }
  if (token && user) {
    await page.addInitScript(({ token: savedToken, user: savedUser }) => {
      localStorage.setItem("credential-ecosystem-token", savedToken);
      localStorage.setItem("credential-ecosystem-user", savedUser);
    }, { token, user });
    return;
  }
  test.skip(true, "Set EDITOR_SWEEP_EMAIL and EDITOR_SWEEP_PASSWORD (an institution account) to run the editor sweep.");
}

/** Pads the institution's active signatories to three with sample entries, so three can be included. Never saved. */
async function provideThreeSignatories(page: Page) {
  await page.route("**/api/institutions/me/signatories", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = (await response.json()) as { signatories: { id: string; name: string; title: string; signatureUrl: string | null; displayOrder: number }[] };
    const signatories = [...body.signatories];
    const signatureUrl = signatories.find((signatory) => signatory.signatureUrl)?.signatureUrl ?? null;
    for (let index = signatories.length; index < 3; index += 1) {
      signatories.push({ id: `${SYNTHETIC_SIGNATORY_PREFIX}${String(index).padStart(2, "0")}`, name: `Sample Signatory ${index + 1}`, title: "Sweep test", signatureUrl, displayOrder: index });
    }
    await route.fulfill({ response, json: { signatories } });
  });
}

/** Waits until React has stopped committing (deferred preview renders included) for a short while. */
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    let last = window.__editorSweep.commits;
    let stableSince = performance.now();
    const started = performance.now();
    const tick = () => {
      const now = performance.now();
      if (window.__editorSweep.commits !== last) {
        last = window.__editorSweep.commits;
        stableSince = now;
      }
      if (now - stableSince > 300 || now - started > 6000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

function readState(page: Page) {
  return page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>("[data-testid=certificate-preview]");
    const certificate = preview?.querySelector<HTMLElement>("[data-certificate-page]");
    const box = preview?.getBoundingClientRect();
    const header = document.querySelector("[data-testid=template-editor] header");
    return {
      commits: window.__editorSweep.commits,
      renders: { ...window.__editorSweep.renders },
      probeError: window.__editorSweep.probeError ?? "",
      previewPresent: Boolean(certificate),
      previewSize: box ? Math.round(box.width * box.height) : 0,
      previewTextLength: certificate?.innerText.trim().length ?? 0,
      drawingFailed: document.body.innerText.includes("could not be drawn"),
      scrollY: Math.round(window.scrollY),
      headerTop: header ? Math.round(header.getBoundingClientRect().top) : -1,
      documentTallerThanWindow: document.documentElement.scrollHeight > window.innerHeight + 1,
      problemDots: document.querySelectorAll("[data-testid=template-editor] aside [aria-label='Contains a problem']").length,
    };
  });
}

/** Lists the controls of an open section, in page order, as descriptions that can be found again later. */
function discoverControls(content: Locator) {
  return content.evaluate((root): Control[] => {
    const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const labelOf = (element: HTMLElement) => {
      const aria = element.getAttribute("aria-label");
      if (aria) return norm(aria);
      if (element.id) {
        const label = root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return norm(label.textContent);
      }
      return norm(element.closest("label")?.textContent);
    };
    const controls: Control[] = [];
    const seenFieldsets = new Set<Element>();
    const buttonCounts = new Map<string, number>();
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("select, input, textarea, button"))) {
      if (element instanceof HTMLInputElement && element.type === "radio") {
        const fieldset = element.closest("fieldset");
        if (!fieldset || seenFieldsets.has(fieldset)) continue;
        seenFieldsets.add(fieldset);
        const legend = norm(fieldset.querySelector("legend")?.textContent);
        const options = Array.from(fieldset.querySelectorAll("input[type=radio]")).map((input) => norm(input.closest("label")?.textContent));
        controls.push({ kind: "radios", legend, options });
      } else if (element instanceof HTMLSelectElement) {
        controls.push({ kind: "select", label: labelOf(element), options: Array.from(element.options).map((option) => option.value).filter(Boolean) });
      } else if (element instanceof HTMLInputElement && element.type === "checkbox") {
        controls.push({ kind: "checkbox", label: labelOf(element) });
      } else if (element instanceof HTMLInputElement && element.type === "range") {
        controls.push({ kind: "range", label: labelOf(element) });
      } else if (element instanceof HTMLInputElement && element.type === "number") {
        controls.push({ kind: "number", label: labelOf(element), min: Number(element.min), max: Number(element.max) });
      } else if (element instanceof HTMLInputElement && element.type === "color") {
        controls.push({ kind: "color", label: labelOf(element) });
      } else if (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && element.type === "text")) {
        controls.push({ kind: "text", label: labelOf(element), hex: element.maxLength === 7 });
      } else if (element instanceof HTMLButtonElement) {
        if (element.getAttribute("aria-haspopup") === "listbox") {
          const labelId = (element.getAttribute("aria-labelledby") ?? "").split(" ")[0];
          controls.push({ kind: "font", label: norm(document.getElementById(labelId)?.textContent) });
        } else {
          const label = norm(element.getAttribute("aria-label") ?? element.textContent);
          const index = buttonCounts.get(label) ?? 0;
          buttonCounts.set(label, index + 1);
          controls.push({ kind: "button", label, index });
        }
      }
    }
    return controls;
  });
}

function describe(control: Control) {
  return control.kind === "radios" ? control.legend : control.label;
}

async function runSweep(page: Page, testInfo: TestInfo, scenario: { nameLength: string; signatories: number }) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300)); });
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 300)));
  await page.addInitScript(installRenderProbe);
  await provideThreeSignatories(page);
  await signIn(page);

  await page.goto(`/institution/templates/new?starter=${STARTER}`);
  const editor = page.getByTestId("template-editor");
  await expect(editor.locator("[data-certificate-page]")).toBeVisible({ timeout: 240_000 });
  const settings = editor.getByRole("complementary", { name: "Template settings" });
  // The header button holds the title (in its first span), an optional error dot and the arrow.
  const section = (title: string) => settings.locator("section").filter({ has: page.locator("h2 button > span:first-child", { hasText: exact(title) }) });

  async function openSection(title: string) {
    const button = section(title).locator("h2 button");
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    return section(title).locator('[id$="-content"]');
  }

  // Scenario setup: the very long sample name, and the requested number of signatories.
  await editor.getByRole("combobox", { name: "Preview with" }).selectOption(scenario.nameLength);
  const signatoriesContent = await openSection("Signatories");
  for (let guard = 0; guard < 5; guard += 1) {
    const included = signatoriesContent.locator("input[type=checkbox][aria-label^='Include']:checked");
    if ((await included.count()) === 0) break;
    await included.first().click();
  }
  for (let index = 0; index < scenario.signatories; index += 1) {
    await signatoriesContent.locator("input[type=checkbox][aria-label^='Include']:not(:checked):not(:disabled)").first().click();
  }
  await settle(page);
  await expect(signatoriesContent.locator("input[type=checkbox][aria-label^='Include']:checked")).toHaveCount(scenario.signatories);

  const rows: Row[] = [];
  async function change(sectionTitle: string, control: string, label: string, action: () => Promise<void>) {
    const before = await readState(page);
    const consoleBefore = consoleErrors.length;
    const errorsBefore = pageErrors.length;
    await action();
    await settle(page);
    const after = await readState(page);
    const problems: string[] = [];
    const commits = after.commits - before.commits;
    const editorRenders = (after.renders.EditorWorkspace ?? 0) - (before.renders.EditorWorkspace ?? 0);
    const rendererRenders = (after.renders.CertificateRenderer ?? 0) - (before.renders.CertificateRenderer ?? 0);
    if (!after.previewPresent || after.previewSize < 10_000 || after.previewTextLength < 20) problems.push("preview missing or empty");
    if (after.drawingFailed) problems.push("a drawing failure message is shown");
    if (after.scrollY !== 0 || after.headerTop < 0) problems.push(`the window scrolled away from the editor (scrollY ${after.scrollY})`);
    if (after.documentTallerThanWindow) problems.push("the page became taller than the window");
    if (after.problemDots > 0) problems.push(`${after.problemDots} section(s) show a validation problem`);
    if (commits > MAX_COMMITS) problems.push(`${commits} commits (max ${MAX_COMMITS})`);
    if (editorRenders > MAX_EDITOR_RENDERS) problems.push(`${editorRenders} editor renders (max ${MAX_EDITOR_RENDERS})`);
    if (rendererRenders > MAX_RENDERER_RENDERS) problems.push(`${rendererRenders} renderer renders (max ${MAX_RENDERER_RENDERS})`);
    if (after.probeError) problems.push(`render probe: ${after.probeError}`);
    const row: Row = {
      section: sectionTitle,
      control,
      change: label,
      commits,
      editorRenders,
      rendererRenders,
      consoleErrors: consoleErrors.slice(consoleBefore),
      pageErrors: pageErrors.slice(errorsBefore),
      problems,
    };
    if (row.consoleErrors.length) problems.push(`console errors: ${row.consoleErrors.join(" | ")}`);
    if (row.pageErrors.length) problems.push(`uncaught exceptions: ${row.pageErrors.join(" | ")}`);
    rows.push(row);
  }

  const sectionTitles = await settings.locator("section h2 button > span:first-child").allInnerTexts();
  expect(sectionTitles.map((title) => title.trim())).toHaveLength(9);

  for (const rawTitle of sectionTitles) {
    const title = rawTitle.trim();
    const content = await openSection(title);
    const controls = await discoverControls(content);
    console.log(`${title}: ${controls.length} controls (${controls.map(describe).join(", ")})`);
    for (const control of controls) {
      const name = describe(control);
      switch (control.kind) {
        case "radios": {
          for (const option of control.options) {
            const label = content.locator("fieldset").filter({ has: page.locator("legend", { hasText: exact(control.legend) }) }).locator("label", { hasText: exact(option) });
            if (await label.count() === 0) continue;
            await change(title, name, option, () => label.first().click());
          }
          break;
        }
        case "select": {
          const select = content.getByLabel(control.label, { exact: true });
          const insertInto = control.label.startsWith("Insert placeholder into ") ? control.label.slice("Insert placeholder into ".length) : "";
          const field = insertInto ? content.getByLabel(insertInto.charAt(0).toUpperCase() + insertInto.slice(1), { exact: true }) : null;
          for (const option of control.options) {
            if (await select.count() === 0) break;
            const original = field ? await field.inputValue() : "";
            await change(title, name, `option ${option}`, () => select.selectOption(option).then(() => undefined));
            if (field) await change(title, name, `restore after ${option}`, () => field.fill(original));
          }
          break;
        }
        case "checkbox": {
          const box = content.getByLabel(control.label, { exact: true });
          if (await box.count() === 0 || await box.isDisabled()) break;
          await change(title, name, "toggle", () => box.click());
          if (await box.isDisabled()) break;
          await change(title, name, "toggle back", () => box.click());
          break;
        }
        case "range": {
          const slider = content.getByLabel(control.label, { exact: true });
          if (await slider.count() === 0) break;
          await change(title, name, "maximum", async () => { await slider.focus(); await page.keyboard.press("End"); });
          await change(title, name, "minimum", async () => { await slider.focus(); await page.keyboard.press("Home"); });
          break;
        }
        case "number": {
          const input = content.getByLabel(control.label, { exact: true });
          if (await input.count() === 0) break;
          await change(title, name, `type ${control.max}`, () => input.fill(String(control.max)));
          await change(title, name, `type ${control.min}`, () => input.fill(String(control.min)));
          break;
        }
        case "color": {
          const picker = content.getByLabel(control.label, { exact: true });
          if (await picker.count() === 0) break;
          await change(title, name, "#1a1a1a", () => picker.fill("#1a1a1a"));
          await change(title, name, "#c0c0c0", () => picker.fill("#c0c0c0"));
          break;
        }
        case "text": {
          const input = content.getByLabel(control.label, { exact: true });
          if (await input.count() === 0) break;
          if (control.hex) {
            await change(title, name, "type #2B4C7E", () => input.fill("#2B4C7E"));
          } else {
            const original = await input.inputValue();
            await change(title, name, "type a longer text", () => input.fill(`${original} Sweep`));
            await change(title, name, "restore", () => input.fill(original));
          }
          break;
        }
        case "font": {
          const button = content.getByRole("button", { name: new RegExp(`^${control.label}`) });
          // The font picker's own list (role listbox); native <select> options are not part of it.
          const fontList = content.getByRole("listbox");
          await button.click();
          const fonts = (await fontList.getByRole("option").allInnerTexts()).map((text) => text.split("\n")[0].trim());
          await page.keyboard.press("Escape");
          for (const font of fonts) {
            await change(title, name, font, async () => {
              await button.click();
              await fontList.getByRole("option").filter({ hasText: font }).first().click();
            });
          }
          break;
        }
        case "button": {
          const button = content.getByRole("button", { name: control.label, exact: true }).nth(control.index);
          if (await button.count() === 0 || await button.isDisabled()) break;
          await change(title, name, "click", () => button.click());
          break;
        }
      }
    }
    // The section header is a control too: collapse and expand it.
    const header = section(title).locator("h2 button");
    await change(title, "Section header", "collapse", () => header.click());
    await change(title, "Section header", "expand", () => header.click());
  }

  // Results: one line per change in a JSON file, and a per-control summary table.
  const summary = new Map<string, { section: string; control: string; changes: number; maxCommits: number; maxEditor: number; maxRenderer: number; consoleErrors: number; pageErrors: number; problems: Set<string> }>();
  for (const row of rows) {
    const key = `${row.section} / ${row.control}`;
    const entry = summary.get(key) ?? { section: row.section, control: row.control, changes: 0, maxCommits: 0, maxEditor: 0, maxRenderer: 0, consoleErrors: 0, pageErrors: 0, problems: new Set<string>() };
    entry.changes += 1;
    entry.maxCommits = Math.max(entry.maxCommits, row.commits);
    entry.maxEditor = Math.max(entry.maxEditor, row.editorRenders);
    entry.maxRenderer = Math.max(entry.maxRenderer, row.rendererRenders);
    entry.consoleErrors += row.consoleErrors.length;
    entry.pageErrors += row.pageErrors.length;
    row.problems.forEach((problem) => entry.problems.add(problem));
    summary.set(key, entry);
  }
  const table = [
    "| Section | Control | Changes | Max commits | Max editor renders | Max renderer renders | Console errors | Exceptions | Result |",
    "|---|---|---|---|---|---|---|---|---|",
    ...[...summary.values()].map((entry) => `| ${entry.section} | ${entry.control} | ${entry.changes} | ${entry.maxCommits} | ${entry.maxEditor} | ${entry.maxRenderer} | ${entry.consoleErrors} | ${entry.pageErrors} | ${entry.problems.size ? [...entry.problems].join("; ") : "pass"} |`),
  ].join("\n");
  await testInfo.attach("editor-sweep-rows.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
  await testInfo.attach("editor-sweep-table.md", { body: table, contentType: "text/markdown" });
  console.log(`\n${testInfo.title}: ${rows.length} changes\n${table}\n`);

  const failures = rows.filter((row) => row.problems.length > 0).map((row) => `${row.section} / ${row.control} / ${row.change}: ${row.problems.join("; ")}`);
  expect(failures, failures.join("\n")).toEqual([]);
  expect(rows.length).toBeGreaterThan(100);
}

test("every editor control, very long name, three signatories", async ({ page }, testInfo) => {
  await runSweep(page, testInfo, { nameLength: "veryLong", signatories: 3 });
});

test("every editor control, very long name, no signatories", async ({ page }, testInfo) => {
  await runSweep(page, testInfo, { nameLength: "veryLong", signatories: 0 });
});
