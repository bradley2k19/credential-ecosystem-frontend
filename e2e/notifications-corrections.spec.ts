import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser checks for notifications, correction requests and student editing. Every API call is answered by the
 * in-browser mock below, so no backend or database is needed: run against any running frontend (see README.md).
 */

const WALLET = "0x1111111111111111111111111111111111111111";
const STUDENT_USER = { id: "student-user", email: "ada@example.test", role: "student" };
const INSTITUTION_USER = { id: "institution-user", email: "registrar@example.test", role: "institution" };
const ORIGINAL_UID = "11111111-0000-4000-8000-000000000001";
const NEW_UID = "22222222-0000-4000-8000-000000000002";

// The mock API's records are loose JSON on purpose (they mirror the server's responses).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const snapshot = {
  snapshotVersion: 1,
  template: { id: null, name: "Classic (built-in)" },
  design: {},
  institution: { name: "Example University", brandColor: null, logoAssetId: null, sealAssetId: null },
  signatories: [],
};

function certificate(overrides: Json = {}): Json {
  return {
    id: "cert-1",
    certificateUid: ORIGINAL_UID,
    studentId: "student-1",
    certificateType: "Bachelor of Science",
    programName: "Computer Science",
    classification: "First Class Honours",
    issueDate: "2026-09-16T00:00:00.000Z",
    graduationDate: "2026-06-30T00:00:00.000Z",
    certificateHash: `0x${"ab".repeat(32)}`,
    status: "ACTIVE",
    revokedReason: null,
    templateId: "",
    templateName: "Classic (built-in)",
    student: { fullName: "Ada Lovelace", studentNumber: "STU-001" },
    institutionName: "Example University",
    renderSnapshot: snapshot,
    snapshotIsFallback: false,
    onChain: { issue: null, revoke: null },
    ...overrides,
  };
}

function notifications(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `n-${index + 1}`,
    type: "CERT_ISSUED",
    message: `Notification ${index + 1}`,
    isRead: index >= 3,
    createdAt: new Date(Date.now() - index * 60_000).toISOString(),
    relatedCertificateId: index === 0 ? "cert-1" : null,
    relatedCorrectionRequestId: index === 1 ? "req-1" : null,
  }));
}

/** The state behind the mock API; tests change it to set up each case. */
function mockState() {
  return {
    notifications: notifications(25) as Json[],
    certificates: [certificate()] as Json[],
    requests: [] as Json[],
    students: [{ id: "student-1", fullName: "Ada Lovelace", studentNumber: "STU-001", programName: "Computer Science", enrollmentYear: 2022, dateOfBirth: "2003-04-05T00:00:00.000Z", user: { email: "ada@example.test" } }] as Json[],
    notifyOnVerification: true,
    failPreference: false,
    failStudentSave: false,
    calls: [] as { method: string; path: string; search: string; body: Json }[],
  };
}
type MockState = ReturnType<typeof mockState>;

function stageOf(request: Json, state: MockState) {
  if (request.status === "PENDING") return "pending";
  if (request.status === "REJECTED") return "rejected";
  if (!request.replacement) return "approved_awaiting_reissue";
  const original = state.certificates.find((item) => item.id === request.certificate.id);
  return original?.status === "REVOKED" ? "completed" : "replacement_issued";
}
const withStage = (request: Json, state: MockState): Json => {
  const original = state.certificates.find((item) => item.id === request.certificate.id);
  return { ...request, stage: stageOf(request, state), certificate: { ...request.certificate, status: original?.status ?? "ACTIVE" } };
};

function correctionRequest(overrides: Json = {}): Json {
  return {
    id: "req-1",
    requestDetails: "My name is misspelled: it should read Ada Lovelace, not Ada Lovelase.",
    status: "PENDING",
    resolutionNote: null,
    requestedAt: "2026-11-20T10:00:00.000Z",
    resolvedAt: null,
    certificate: { id: "cert-1", certificateUid: ORIGINAL_UID, certificateType: "Bachelor of Science", programName: "Computer Science", status: "ACTIVE" },
    replacement: null,
    student: { fullName: "Ada Lovelace", studentNumber: "STU-001" },
    ...overrides,
  };
}

async function installMock(page: Page, state: MockState, origin: string) {
  const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "GET, POST, PATCH, PUT, OPTIONS" };
  await page.route((url) => url.pathname.startsWith("/api/"), async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body: Json = request.postData() ? JSON.parse(request.postData()!) : {};
    state.calls.push({ method, path, search: url.search, body });
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json, headers: cors });
    const query = url.searchParams;
    let match: RegExpMatchArray | null;

    // Notifications (both roles).
    if (method === "GET" && path === "/api/notifications") {
      const page = Number(query.get("page") ?? 1);
      const limit = Number(query.get("limit") ?? 20);
      const list = query.get("unread") === "true" ? state.notifications.filter((item) => !item.isRead) : state.notifications;
      return reply({ notifications: list.slice((page - 1) * limit, page * limit), unreadCount: state.notifications.filter((item) => !item.isRead).length, pagination: { page, limit, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / limit)) } });
    }
    if (method === "GET" && path === "/api/notifications/unread-count") return reply({ unreadCount: state.notifications.filter((item) => !item.isRead).length });
    if (method === "POST" && path === "/api/notifications/read-all") {
      const updated = state.notifications.filter((item) => !item.isRead).length;
      state.notifications.forEach((item) => { item.isRead = true; });
      return reply({ updated });
    }
    if (method === "PATCH" && (match = path.match(/^\/api\/notifications\/([^/]+)\/read$/))) {
      const item = state.notifications.find((entry) => entry.id === match![1]);
      if (!item) return reply({ error: "Notification not found" }, 404);
      item.isRead = true;
      return reply({ id: item.id, isRead: true });
    }

    // Student.
    if (method === "GET" && path === "/api/students/me") {
      return reply({ fullName: "Ada Lovelace", studentNumber: "STU-001", programName: "Computer Science", enrollmentYear: 2022, email: "ada@example.test", institutionName: "Example University", notifyOnVerification: state.notifyOnVerification });
    }
    if (method === "PATCH" && path === "/api/students/me/preferences") {
      if (state.failPreference) return reply({ error: "Database unreachable or operation failed" }, 503);
      state.notifyOnVerification = body.notifyOnVerification;
      return reply({ notifyOnVerification: state.notifyOnVerification });
    }
    if (method === "GET" && path === "/api/students/me/certificates") return reply({ certificates: state.certificates, pagination: { page: 1, limit: 100, total: state.certificates.length, totalPages: 1 } });
    if (method === "GET" && (match = path.match(/^\/api\/students\/me\/certificates\/([^/]+)$/))) {
      const found = state.certificates.find((item) => item.id === match![1]);
      return found ? reply(found) : reply({ error: "Certificate not found" }, 404);
    }
    if (method === "GET" && path === "/api/students/me/correction-requests") {
      // The student's own view has no `student` field.
      return reply({ correctionRequests: state.requests.map((item) => ({ ...withStage(item, state), student: undefined })) });
    }
    if (method === "POST" && (match = path.match(/^\/api\/students\/me\/certificates\/([^/]+)\/correction-requests$/))) {
      const created = correctionRequest({ id: `req-${state.requests.length + 1}`, requestDetails: body.requestDetails, requestedAt: new Date().toISOString() });
      state.requests.unshift(created);
      return reply(withStage(created, state), 201);
    }
    if (method === "GET" && path === "/api/students/me/verifications") return reply({ verifications: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });

    // Institution.
    if (method === "GET" && path === "/api/institutions/me/profile") return reply({ id: "inst-1", name: "Example University", logoUrl: null, sealUrl: null, brandColor: null, isVerified: true });
    if (method === "GET" && path === "/api/institutions/me/issuer-status") return reply({ hasWallet: true, isIssuer: true, walletAddress: WALLET, isVerified: true });
    if (method === "GET" && path === "/api/institutions/me/templates") return reply({ templates: [] });
    if (method === "GET" && path === "/api/institutions/me/signatories") return reply({ signatories: [] });
    if (method === "GET" && path === "/api/institutions/students") return reply({ students: state.students, pagination: { page: 1, limit: 20, total: state.students.length, totalPages: 1 } });
    if ((match = path.match(/^\/api\/institutions\/students\/([^/]+)$/))) {
      const student = state.students.find((item) => item.id === match![1]);
      if (!student) return reply({ error: "Student not found" }, 404);
      if (method === "GET") return reply(student);
      if (method === "PUT") {
        if (state.failStudentSave) return reply({ error: "Database unreachable or operation failed" }, 503);
        Object.assign(student, body);
        return reply(student);
      }
    }
    if (method === "GET" && path === "/api/institutions/certificates") {
      const studentId = query.get("studentId");
      const list = studentId ? state.certificates.filter((item) => item.studentId === studentId) : state.certificates;
      return reply({ certificates: list, pagination: { page: 1, limit: 100, total: list.length, totalPages: 1 } });
    }
    if (method === "POST" && path === "/api/institutions/certificates") {
      const created = certificate({ id: "cert-2", certificateUid: NEW_UID, ...body, issueDate: `${body.issueDate}T00:00:00.000Z` });
      state.certificates.unshift(created);
      const request = state.requests.find((item) => item.id === body.correctionRequestId);
      if (request) request.replacement = { id: created.id, certificateUid: created.certificateUid, certificateType: created.certificateType };
      return reply(created, 201);
    }
    if (method === "GET" && (match = path.match(/^\/api\/institutions\/certificates\/([^/]+)$/))) {
      const found = state.certificates.find((item) => item.id === match![1]);
      return found ? reply(found) : reply({ error: "Certificate not found" }, 404);
    }
    if (method === "PATCH" && (match = path.match(/^\/api\/institutions\/certificates\/([^/]+)\/revoke$/))) {
      const found = state.certificates.find((item) => item.id === match![1])!;
      Object.assign(found, { status: "REVOKED", revokedReason: body.revokedReason });
      return reply(found);
    }
    if (method === "GET" && path === "/api/institutions/correction-requests") {
      const status = query.get("status");
      const list = state.requests.filter((item) => !status || item.status === status.toUpperCase()).map((item) => withStage(item, state));
      return reply({ correctionRequests: list, pendingCount: state.requests.filter((item) => item.status === "PENDING").length, pagination: { page: 1, limit: 20, total: list.length, totalPages: 1 } });
    }
    if ((match = path.match(/^\/api\/institutions\/correction-requests\/([^/]+)(?:\/(approve|reject))?$/))) {
      const found = state.requests.find((item) => item.id === match![1]);
      if (!found) return reply({ error: "Correction request not found" }, 404);
      if (method === "GET" && !match[2]) return reply(withStage(found, state));
      if (method === "POST" && match[2]) {
        if (found.status !== "PENDING") return reply({ error: "This correction request has already been decided" }, 409);
        if (match[2] === "reject" && !body?.note) return reply({ error: "A note is required to reject a correction request" }, 400);
        Object.assign(found, { status: match[2] === "approve" ? "APPROVED" : "REJECTED", resolutionNote: body?.note ?? null, resolvedAt: new Date().toISOString() });
        return reply(withStage(found, state));
      }
    }
    return reply({ error: `Not mocked: ${method} ${path}` }, 404);
  });
}

/** Signs this tab in (sessionStorage) and installs the mock API. */
async function openAs(page: Page, user: Json, state: MockState, baseURL: string) {
  await page.addInitScript(({ token, user }) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    sessionStorage.setItem("credential-ecosystem-token", token);
    sessionStorage.setItem("credential-ecosystem-user", user);
  }, { token: "mock-token", user: JSON.stringify(user) });
  await installMock(page, state, new URL(baseURL).origin);
}

const callsTo = (state: MockState, method: string, path: string | RegExp) =>
  state.calls.filter((call) => call.method === method && (typeof path === "string" ? call.path === path : path.test(call.path)));

test.describe("notifications", () => {
  test("the bell polls every 2 minutes only while the tab is visible and in use, and checks on focus", async ({ page, baseURL }) => {
    const state = mockState();
    // A controlled clock. It also drives animation frames, so this test only reads the page and never clicks.
    await page.clock.install();
    await openAs(page, STUDENT_USER, state, baseURL!);
    await page.goto("/student/dashboard");

    const bell = page.locator('[data-notification-bell="sidebar"]');
    await expect(bell).toHaveAttribute("aria-label", "Notifications, 3 unread");
    await expect(bell.locator("[data-unread-badge]")).toHaveText("3");
    // The desktop sidebar (the small-screen drawer holds a second, hidden copy of the navigation).
    await expect(page.locator('aside [data-nav-item="/student/notifications"] [data-nav-badge]')).toContainText("3");

    const polls = () => callsTo(state, "GET", "/api/notifications/unread-count").length;
    /** Runs the page's clock forward (firing every timer due), then lets any request it started arrive. */
    const wait = async (ms: number) => { await page.clock.runFor(ms); await page.waitForTimeout(300); };
    const setTabHidden = (hidden: boolean) => page.evaluate((value) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (value ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

    // Every 2 minutes: nothing after 100 seconds, one check by 130.
    let expected = polls();
    await wait(100_000);
    expect(polls()).toBe(expected);
    state.notifications[3].isRead = false;
    await wait(30_000);
    await expect.poll(polls).toBe(++expected);
    await expect(bell.locator("[data-unread-badge]")).toHaveText("4");

    // Hidden tab: no checks at all, however long. Visible again: one check at once, then every 2 minutes again.
    await setTabHidden(true);
    await wait(10 * 60_000);
    expect(polls()).toBe(expected);
    await setTabHidden(false);
    await expect.poll(polls).toBe(++expected);
    await wait(100_000);
    expect(polls()).toBe(expected);
    await wait(30_000);
    await expect.poll(polls).toBe(++expected);

    // Regaining focus still checks at once.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(polls).toBe(++expected);

    // 10 minutes without mouse, key or touch input: checks stop (at most 5 more, one per 2 minutes, before that).
    await wait(11 * 60_000);
    await wait(10 * 60_000);
    const whenIdle = polls();
    expect(whenIdle - expected).toBeLessThanOrEqual(5);
    await wait(20 * 60_000);
    expect(polls()).toBe(whenIdle);

    // The next input resumes them: one check at once, then every 2 minutes.
    await page.mouse.move(400, 300);
    await expect.poll(polls).toBe(whenIdle + 1);
    await wait(130_000);
    await expect.poll(polls).toBe(whenIdle + 2);
  });

  test("the bell panel lists the latest 10, marks all as read, links to all, and opens an item", async ({ page, baseURL }) => {
    const state = mockState();
    await openAs(page, STUDENT_USER, state, baseURL!);
    await page.goto("/student/dashboard");
    const bell = page.locator('[data-notification-bell="sidebar"]');
    await expect(bell.locator("[data-unread-badge]")).toHaveText("3");

    await bell.click();
    const panel = page.locator("[data-notification-panel]");
    await expect(panel.locator("[data-notification-item]")).toHaveCount(10);
    expect(callsTo(state, "GET", "/api/notifications").at(-1)!.search).toContain("limit=10");
    await expect(panel.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/student/notifications");
    await panel.getByRole("button", { name: "Mark all as read" }).click();
    await expect(bell.locator("[data-unread-badge]")).toHaveCount(0);
    expect(callsTo(state, "POST", "/api/notifications/read-all")).toHaveLength(1);

    // Escape closes the panel. Reopened, clicking an item marks it read and goes to what it concerns (a certificate).
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    state.notifications[0].isRead = false;
    await bell.click();
    await panel.locator('[data-notification-item="n-1"]').click();
    await expect(page).toHaveURL(/\/student\/certificates\/cert-1$/);
    expect(callsTo(state, "PATCH", "/api/notifications/n-1/read")).toHaveLength(1);
  });

  for (const role of ["student", "institution"] as const) {
    test(`the ${role} notifications page has an unread filter, paging and empty states`, async ({ page, baseURL }) => {
      const state = mockState();
      await openAs(page, role === "student" ? STUDENT_USER : INSTITUTION_USER, state, baseURL!);
      await page.goto(`/${role}/notifications`);
      const rows = page.locator("[data-notification-row]");
      await expect(rows).toHaveCount(20);
      await page.getByRole("button", { name: "Next" }).click();
      await expect(rows).toHaveCount(5);
      expect(callsTo(state, "GET", "/api/notifications").at(-1)!.search).toContain("page=2");

      await page.getByRole("button", { name: "Unread", exact: true }).click();
      await expect(rows).toHaveCount(3);
      expect(callsTo(state, "GET", "/api/notifications").at(-1)!.search).toContain("unread=true");
      await rows.first().getByRole("button", { name: "Mark as read" }).click();
      await expect(rows.first().getByRole("button", { name: "Mark as read" })).toHaveCount(0);

      await page.getByRole("button", { name: "Mark all as read" }).click();
      await expect(page.locator("[data-notifications-empty]")).toHaveText("No unread notifications.");
      if (role === "institution") {
        // In rail mode the sidebar still shows the counts on the icons.
        state.notifications[0].isRead = false;
        state.requests = [correctionRequest()];
        await page.reload();
        await page.getByRole("button", { name: "Collapse sidebar" }).click();
        await expect(page.locator('aside[data-sidebar-state="rail"] [data-nav-item="/institution/corrections"] [data-nav-badge]')).toHaveText("1");
        await expect(page.locator('aside[data-sidebar-state="rail"] [data-nav-item="/institution/notifications"] [data-nav-badge]')).toHaveText("1");
        await page.getByRole("button", { name: "Expand sidebar" }).click();
      }
    });
  }
});

test.describe("student", () => {
  test("requests a correction from the certificate page; then sees its status instead of the button", async ({ page, baseURL }) => {
    const state = mockState();
    await openAs(page, STUDENT_USER, state, baseURL!);
    await page.goto("/student/certificates/cert-1");
    await page.getByRole("button", { name: "Request a correction" }).click();
    const dialog = page.getByTestId("correction-request-dialog");
    await expect(dialog).toContainText("Describe what is wrong and what it should say.");
    const send = dialog.getByRole("button", { name: "Send request" });
    await dialog.getByLabel("What needs correcting").fill("Too short");
    await expect(send).toBeDisabled();
    await expect(dialog.locator("[data-character-count]")).toContainText("9 / 1000");
    const text = "My name is misspelled: it should read Ada Lovelace.";
    await dialog.getByLabel("What needs correcting").fill(text);
    await expect(dialog.locator("[data-character-count]")).toHaveText(`${text.length} / 1000`);
    await send.click();
    await expect(dialog).toHaveCount(0);
    expect(callsTo(state, "POST", /correction-requests$/)[0].body).toEqual({ requestDetails: text });

    const status = page.locator("[data-correction-status]");
    await expect(status).toContainText("Waiting for the institution");
    await expect(page.getByRole("button", { name: /Request (a|another) correction/ })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-correction-status="pending"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Request (a|another) correction/ })).toHaveCount(0);
  });

  test("the corrections page shows stages, the institution's note and the replacement", async ({ page, baseURL }) => {
    const state = mockState();
    state.certificates.push(certificate({ id: "cert-2", certificateUid: NEW_UID }));
    state.requests = [
      correctionRequest({ id: "req-2", status: "APPROVED", resolutionNote: "We will reissue it.", replacement: { id: "cert-2", certificateUid: NEW_UID, certificateType: "Bachelor of Science" } }),
      correctionRequest({ id: "req-1", status: "REJECTED", resolutionNote: "The name matches our records." }),
    ];
    await openAs(page, STUDENT_USER, state, baseURL!);
    await page.goto("/student/corrections?request=req-2");
    const approved = page.locator('[data-correction-request="req-2"]');
    await expect(approved.locator("[data-stage]")).toHaveText("Corrected certificate issued");
    await expect(approved).toContainText("We will reissue it.");
    await expect(approved.getByRole("link", { name: "Corrected certificate" })).toHaveAttribute("href", "/student/certificates/cert-2");
    await expect(page.locator('[data-correction-request="req-1"] [data-stage]')).toHaveText("Rejected");
  });

  test("the verification notification preference is saved immediately, and reverts if saving fails", async ({ page, baseURL }) => {
    const state = mockState();
    await openAs(page, STUDENT_USER, state, baseURL!);
    await page.goto("/student/profile");
    await expect(page.getByText("printed on your certificates")).toBeVisible();
    const toggle = page.getByRole("switch", { name: "Notify me when my certificates are verified" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(callsTo(state, "PATCH", "/api/students/me/preferences")[0].body).toEqual({ notifyOnVerification: false });

    state.failPreference = true;
    await toggle.click();
    await expect(page.getByRole("alert").filter({ hasText: "Not saved" })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("institution", () => {
  test("approves and rejects requests, each after a confirmation", async ({ page, baseURL }) => {
    const state = mockState();
    state.requests = [correctionRequest({ id: "req-1" }), correctionRequest({ id: "req-2" })];
    await openAs(page, INSTITUTION_USER, state, baseURL!);
    await page.goto("/institution/dashboard");
    await expect(page.locator("[data-pending-corrections-card]")).toContainText("2 requests are waiting");

    await page.goto("/institution/corrections");
    await page.locator('[data-correction-row="req-1"]').getByRole("button", { name: "Open" }).click();
    const detail = page.getByTestId("correction-detail");
    await expect(detail.locator("[data-request-text]")).toContainText("misspelled");
    await expect(detail.locator("[data-certificate-page]")).toBeVisible();
    await detail.getByRole("button", { name: "Approve" }).click();
    await detail.getByLabel("Note to the student (optional)").fill("We will reissue it.");
    await detail.getByRole("button", { name: "Confirm approval" }).click();
    await expect(detail.locator("[data-stage]")).toHaveText("Approved, reissue needed");
    await expect(detail.locator("[data-reissue-link]")).toHaveAttribute("href", "/institution/certificates?correct=req-1");
    expect(callsTo(state, "POST", "/api/institutions/correction-requests/req-1/approve")[0].body).toEqual({ note: "We will reissue it." });
    await detail.getByRole("button", { name: "Close" }).click();

    await page.locator('[data-correction-row="req-2"]').getByRole("button", { name: "Open" }).click();
    await detail.getByRole("button", { name: "Reject" }).click();
    await detail.getByRole("button", { name: "Confirm rejection" }).click();
    await expect(detail.getByRole("alert")).toContainText("Add a note");
    expect(callsTo(state, "POST", /reject$/)).toHaveLength(0);
    await detail.getByLabel("Note to the student (required)").fill("The name matches our records.");
    await detail.getByRole("button", { name: "Confirm rejection" }).click();
    await expect(detail.locator("[data-stage]")).toHaveText("Rejected");
  });

  test("reissues an approved request from a prefilled form, with the student locked", async ({ page, baseURL }) => {
    const state = mockState();
    state.requests = [correctionRequest({ status: "APPROVED" })];
    await openAs(page, INSTITUTION_USER, state, baseURL!);
    // A stand-in wallet: the linked account on Polygon Amoy, which declines to sign (no transaction is needed here).
    await page.addInitScript((wallet) => {
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_chainId") return "0x13882";
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [wallet];
          throw Object.assign(new Error("User rejected the request."), { code: 4001 });
        },
        on() {},
        removeListener() {},
      };
    }, WALLET);
    await page.goto("/institution/certificates?correct=req-1");

    const banner = page.locator("[data-correction-banner]");
    await expect(banner).toContainText(`Correcting certificate ${ORIGINAL_UID}`);
    await expect(banner.getByRole("link", { name: "edit student details first" })).toHaveAttribute("href", `/institution/students?edit=student-1&returnTo=${encodeURIComponent("/institution/certificates?correct=req-1")}`);
    await expect(page.locator("#certificate-student")).toBeDisabled();
    await expect(page.locator("#certificate-student")).toHaveValue("student-1");
    await expect(page.locator("#certificate-certificateType")).toHaveValue("Bachelor of Science");
    await expect(page.locator("#certificate-programName")).toHaveValue("Computer Science");
    await expect(page.locator("#certificate-classification")).toHaveValue("First Class Honours");
    await expect(page.locator("#certificate-issueDate")).toHaveValue("2026-09-16");
    await expect(page.locator("#certificate-graduationDate")).toHaveValue("2026-06-30");

    await page.getByRole("button", { name: "Create and issue certificate" }).click();
    await expect.poll(() => callsTo(state, "POST", "/api/institutions/certificates").length).toBe(1);
    expect(callsTo(state, "POST", "/api/institutions/certificates")[0].body).toMatchObject({
      studentId: "student-1", certificateType: "Bachelor of Science", programName: "Computer Science", classification: "First Class Honours",
      issueDate: "2026-09-16", graduationDate: "2026-06-30", correctionRequestId: "req-1",
    });
    // The replacement exists, so the next step is shown.
    await expect(page.locator("[data-revoke-original-prompt]")).toContainText("Now revoke the original certificate");
  });

  test("the revoke prompt opens the usual revoke panel with the reason filled in", async ({ page, baseURL }) => {
    const state = mockState();
    state.certificates.unshift(certificate({ id: "cert-2", certificateUid: NEW_UID }));
    state.requests = [correctionRequest({ status: "APPROVED", replacement: { id: "cert-2", certificateUid: NEW_UID, certificateType: "Bachelor of Science" } })];
    await openAs(page, INSTITUTION_USER, state, baseURL!);
    await page.goto("/institution/certificates?correct=req-1");
    const prompt = page.locator("[data-revoke-original-prompt]");
    await expect(prompt).toContainText("Now revoke the original certificate");
    await prompt.getByRole("button", { name: "Revoke the original certificate" }).click();
    const reason = page.locator("#revoke-reason-cert-1");
    await expect(reason).toHaveValue(`Replaced by corrected certificate ${NEW_UID} after a correction request`);
    // The user still confirms, as usual.
    expect(callsTo(state, "PATCH", /revoke$/)).toHaveLength(0);
    await page.getByRole("button", { name: "Revoke certificate" }).click();
    await expect.poll(() => callsTo(state, "PATCH", "/api/institutions/certificates/cert-1/revoke").length).toBe(1);
    expect(callsTo(state, "PATCH", "/api/institutions/certificates/cert-1/revoke")[0].body).toEqual({ revokedReason: `Replaced by corrected certificate ${NEW_UID} after a correction request` });
    await expect(page.locator("[data-correction-banner]")).toContainText("Correction completed");
  });

  test("edits a student from the students page, with the future-only note and clear errors", async ({ page, baseURL }) => {
    const state = mockState();
    await openAs(page, INSTITUTION_USER, state, baseURL!);
    await page.goto("/institution/students");
    await page.getByRole("button", { name: "Edit Ada Lovelace" }).click();
    const dialog = page.getByTestId("student-edit-dialog");
    await expect(dialog.locator("[data-future-only-note]")).toHaveText("Changes affect only certificates you issue from now on. Certificates already issued keep the details they were issued with. To correct an issued certificate, use the correction requests.");
    await expect(dialog.locator("#edit-studentNumber")).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("Date of birth (optional)")).toHaveValue("2003-04-05");

    state.failStudentSave = true;
    await dialog.getByLabel("Full name").fill("Ada King");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toContainText("The changes were not saved");
    await expect(dialog).toBeVisible();

    state.failStudentSave = false;
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    expect(callsTo(state, "PUT", "/api/institutions/students/student-1").at(-1)!.body).toEqual({ fullName: "Ada King", programName: "Computer Science", enrollmentYear: 2022, dateOfBirth: "2003-04-05" });
    await expect(page.locator("[data-student-saved]")).toContainText("Saved the details of Ada King");
    await expect(page.locator('[data-student-row="student-1"]')).toContainText("Ada King");

    // Opened from a correction: the dialog opens straight away, and afterwards leads back.
    await page.goto(`/institution/students?edit=student-1&returnTo=${encodeURIComponent("/institution/certificates?correct=req-1")}`);
    await page.getByTestId("student-edit-dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("link", { name: "Continue the correction" })).toHaveAttribute("href", "/institution/certificates?correct=req-1");
  });
});
