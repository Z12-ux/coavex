/**
 * End-to-end smoke test with playwright-core against a running server.
 *   node scripts/e2e.mjs [baseUrl]
 * Coach (desktop, tablet, mobile) + client (mobile): every screen, the key
 * flows (attention queue, weekly review, message assistant, palette,
 * shortcuts, quick actions, coach workout mode, client daily log / missed
 * session / workout / check-in / message). Fails on console errors or 5xx.
 * Screenshots go to e2e-shots/ (override with E2E_OUT, e.g. E2E_OUT=e2e-shots/live for a run against production).
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3210";
// Against the live demo (per-instance SQLite, writes not shared between instances) some post-write checks are relaxed.
const REMOTE = !/localhost|127\.0\.0\.1/.test(BASE);
const OUT = process.env.E2E_OUT || "e2e-shots";
mkdirSync(OUT, { recursive: true });

const failures = [];
const assert = (cond, msg) => {
  if (!cond) failures.push(msg);
};

function findExecutable() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
  for (const d of dirs) {
    for (const rel of ["chrome-win/chrome.exe", "chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win64/chrome.exe"]) {
      const p = path.join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    const executablePath = findExecutable();
    if (!executablePath) throw e;
    console.log(`[e2e] using ${executablePath}`);
    return chromium.launch({ headless: true, executablePath });
  }
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
}

async function settle(page) {
  await page.waitForSelector("main h1, main h2, form h1", { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** A saved photo shows up as a new thumbnail. On the live demo the refresh can land on another
 * serverless instance (per-instance SQLite), so there the confirmation toast is accepted instead. */
async function waitPhotoSaved(page, before) {
  const grew = page.waitForFunction((n) => document.querySelectorAll('ul[aria-label="Avant / Après"] li').length > n, before, { timeout: 20000 });
  if (!REMOTE) return grew;
  await Promise.race([grew, page.waitForSelector('[role="status"]:has-text("Photo enregistrée")', { timeout: 20000 })]).catch(() => {});
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function clientHref(page, name) {
  await page.goto(`${BASE}/clients`);
  const link = page.locator(`a[href^="/clients/"]:has-text("${name}")`).first();
  await link.waitFor({ state: "attached", timeout: 30000 });
  return (await link.getAttribute("href")).split("?")[0];
}

const browser = await launch();
let lastPage = null;
try {
  for (const [label, viewport] of [
    ["desk", { width: 1366, height: 900 }],
    ["tab", { width: 820, height: 1180 }],
    ["mob", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport, locale: "fr-DZ", hasTouch: label !== "desk" });
    const page = await ctx.newPage();
    lastPage = page;
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

    await page.goto(`${BASE}/clients`);
    assert(page.url().includes("/login"), `${label}: anonymous should be redirected to login`);

    await login(page, "coach@coachos.demo", "coach1234");
    assert(new URL(page.url()).pathname === "/", `${label}: coach lands on Today`);
    await shot(page, `${label}-01-today`);
    assert((await page.locator("main li").count()) > 0, `${label}: attention queue has rows`);
    assert((await page.locator("text=Ahmed Benali").count()) > 0, `${label}: Ahmed appears`);
    assert((await page.locator('a:has-text("Démarrer la séance")').count()) > 0, `${label}: NEXT card offers to start a workout`);

    for (const [p, name] of [
      ["/clients", "02-clients"],
      ["/agenda", "03-agenda"],
      ["/review", "04-review"],
      ["/messages", "05-messages"],
      ["/analytics", "06-analytics"],
      ["/business", "07-business"],
      ["/settings", "08-settings"],
      ["/clients/new", "09-client-new"],
    ]) {
      await page.goto(`${BASE}${p}`);
      await shot(page, `${label}-${name}`);
    }

    const ahmed = await clientHref(page, "Ahmed Benali");
    await page.goto(`${BASE}${ahmed}`);
    await shot(page, `${label}-10-profile-overview`);
    assert((await page.locator("text=Séances manquées").count()) > 0, `${label}: profile shows missed-workouts signal`);
    assert((await page.locator("text=Observation").count()) > 0, `${label}: signal cards label observation`);
    assert((await page.locator("text=Avant / Après").count()) > 0, `${label}: overview shows the before/after card`);
    for (const tab of ["photos", "training", "nutrition", "recovery", "habits", "checkins", "timeline", "notes", "business"]) {
      await page.goto(`${BASE}${ahmed}?tab=${tab}`);
      await shot(page, `${label}-11-profile-${tab}`);
    }

    if (label === "desk") {
      // Before/after: slider (keyboard), side-by-side, upload through the browser-side resizer
      await page.goto(`${BASE}${ahmed}?tab=photos`);
      await settle(page);
      const slider = page.locator('[role="slider"]');
      assert((await slider.count()) > 0, "photos tab shows the before/after slider");
      await slider.focus();
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
      assert((await slider.getAttribute("aria-valuenow")) === "34", "slider moves with the keyboard");
      await shot(page, `${label}-11b-photos-slider`);
      await page.click('button:has-text("Côte à côte")');
      await shot(page, `${label}-11c-photos-side`);
      const thumbsBefore = await page.locator('ul[aria-label="Avant / Après"] li').count();
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 400 } });
      await page.click('summary:has-text("Ajouter une photo")');
      await page.setInputFiles('input[type="file"][name="file"]', { name: "test.png", mimeType: "image/png", buffer: png });
      await page.waitForSelector('img[alt="Aperçu"]', { timeout: 10000 });
      await page.click('button:has-text("Enregistrer la photo")');
      await waitPhotoSaved(page, thumbsBefore);
      await shot(page, `${label}-11d-photos-uploaded`);
    }

    if (label === "mob") {
      // Quick actions FAB → sheet
      await page.goto(`${BASE}/`);
      await settle(page);
      await page.click('button[aria-label="Actions rapides"]');
      await page.waitForSelector("dialog[open]", { timeout: 5000 });
      await shot(page, `${label}-12-quick-actions`);
      assert((await page.locator('dialog[open] a:has-text("Ajouter un client")').count()) > 0, `${label}: quick actions sheet lists add client`);
      await page.keyboard.press("Escape");
      // Contextual bar on profile
      await page.goto(`${BASE}${ahmed}`);
      await settle(page);
      assert((await page.locator('a:has-text("Séance")').count()) > 0, `${label}: profile action bar has Séance`);
    }

    if (label === "desk") {
      // Mark first open action done (toast expected)
      await page.goto(`${BASE}/`);
      await settle(page);
      const doneBtn = page.locator('main form button[value="DONE"]').first();
      if (await doneBtn.count()) {
        await doneBtn.click();
        await page.waitForSelector('[role="status"]', { timeout: 10000 }).catch(() => {});
        assert((await page.locator('[role="status"]').count()) > 0, `${label}: toast after action done`);
      }
      // Weekly review
      await page.goto(`${BASE}/review`);
      await settle(page);
      const gen = page.locator('button:has-text("Générer")').first();
      if (await gen.count()) {
        // Regeneration recomputes every client then redirects: wait for the action to really finish
        // (form busy flag gone + network idle) before touching the items, or the next click is cancelled.
        await gen.click();
        await page.waitForSelector("form[data-busy]", { timeout: 5000 }).catch(() => {});
        await page.waitForSelector("form[data-busy]", { state: "detached", timeout: 90000 });
        await page.waitForLoadState("networkidle");
        await page.waitForSelector('button[value="APPROVED"]', { timeout: 60000 });
      }
      await shot(page, `${label}-12-review-generated`);
      assert((await page.locator('button[value="APPROVED"]').count()) > 0, `${label}: review items generated`);
      const approveBefore = await page.locator('button[value="APPROVED"]').count();
      await page.locator('button[value="APPROVED"]').first().click();
      await page.waitForSelector("form[data-busy]", { state: "detached", timeout: 30000 }).catch(() => {});
      await page.waitForFunction((n) => document.querySelectorAll('button[value="APPROVED"]').length < n, approveBefore, { timeout: 15000 });
      // Message assistant
      await page.goto(`${BASE}/messages`);
      const mehdi = page.locator('a[href^="/messages/"]:has-text("Mehdi Saidi")').first();
      await mehdi.waitFor({ timeout: 30000 });
      await page.goto(`${BASE}${await mehdi.getAttribute("href")}`);
      await settle(page);
      await page.click('button:has-text("Assistant de message")');
      await page.click('button:has-text("Préparer")');
      await page.waitForFunction(() => (document.querySelector('textarea[name="body"]')?.value ?? "").length > 20, null, { timeout: 15000 });
      await shot(page, `${label}-13-message-draft`);
      await page.click('button:has-text("Envoyer dans l\'app")');
      await page.waitForLoadState("networkidle");
      assert((await page.locator("text=Mehdi").count()) > 0, `${label}: conversation still open after send`);
      // Palette + shortcuts
      await page.goto(`${BASE}/`);
      await settle(page);
      await page.waitForTimeout(800);
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+K");
      const opened = await page.waitForSelector("[cmdk-input]", { timeout: 5000 }).then(() => true).catch(() => false);
      assert(opened, `${label}: Ctrl+K opens the palette`);
      if (!opened) {
        await page.click('button[aria-label="Rechercher"]');
        await page.waitForSelector("[cmdk-input]", { timeout: 5000 });
      }
      assert((await page.locator("[cmdk-group-heading]:has-text('Récents')").count()) > 0, `${label}: palette shows recent clients`);
      await page.keyboard.type("sara");
      await page.waitForSelector("[cmdk-item]", { timeout: 10000 }).catch(() => {});
      await shot(page, `${label}-14-palette`);
      assert((await page.locator("[cmdk-item]").count()) > 0, `${label}: palette returns results`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("n");
      await page.waitForURL(/\/clients\/new/, { timeout: 10000 }).catch(() => {});
      assert(page.url().includes("/clients/new"), `${label}: shortcut n opens new client`);
      // Coach workout mode from the agenda (Mehdi, so Ahmed keeps his own session for the client test)
      await page.goto(`${BASE}/agenda`);
      await settle(page);
      const start = page.locator('li:has-text("Mehdi Saidi") a[href*="/train/"]').first();
      assert((await start.count()) > 0, `${label}: agenda offers to start today's session`);
      await start.click();
      await page.waitForURL(/\/train\//, { timeout: 30000 });
      await settle(page);
      await shot(page, `${label}-15-workout-mode`);
      const checks = page.locator('button[aria-pressed="false"]');
      const n = await checks.count();
      assert(n > 0, `${label}: workout mode shows set rows`);
      await checks.first().click();
      await page.waitForSelector('[role="timer"]', { timeout: 5000 }).catch(() => {});
      assert((await page.locator('[role="timer"]').count()) > 0, `${label}: rest timer starts after a set`);
      // open every exercise and mark all sets
      const headers = page.locator("main ol > li > button[aria-expanded]");
      const hn = await headers.count();
      for (let i = 0; i < hn; i++) {
        const h = headers.nth(i);
        if ((await h.getAttribute("aria-expanded")) !== "true") await h.click();
        const pending = page.locator('button[aria-pressed="false"]');
        while (await pending.count()) await pending.first().click();
      }
      await shot(page, `${label}-16-workout-mode-done`);
      await page.click('button:has-text("Terminer la séance")');
      await page.waitForURL((u) => u.pathname.startsWith("/clients/") && (REMOTE || /done=/.test(u.search)), { timeout: 30000 });
      await settle(page);
      assert((await page.locator("text=COMPLETED").count()) > 0, `${label}: session appears completed after coach logging`);
      // RBAC
      await page.goto(`${BASE}/app`);
      assert(new URL(page.url()).pathname === "/", `${label}: staff redirected away from /app`);
    }
    await ctx.close();
    assert(errors.length === 0, `${label} coach: console/server errors: ${errors.slice(0, 5).join(" | ")}`);
  }

  // Client experience (mobile)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-DZ", hasTouch: true });
    const page = await ctx.newPage();
    lastPage = page;
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
    await login(page, "ahmed@coachos.demo", "client1234");
    assert(new URL(page.url()).pathname === "/app", "client lands on /app");
    await shot(page, "client-01-today");
    await page.goto(`${BASE}/clients`);
    assert(new URL(page.url()).pathname === "/app", "client redirected away from /clients");
    const r = await page.request.get(`${BASE}/api/search?q=a`);
    assert(r.status() === 401, "client cannot use staff search API");
    // Daily log
    await page.goto(`${BASE}/app`);
    await settle(page);
    await page.fill('input[name="sleepHours"]', "7");
    await page.click('input[name="energy"][value="4"] + span');
    await page.click('button:has-text("Enregistrer")');
    await page.waitForSelector('[role="status"]', { timeout: 10000 }).catch(() => {});
    assert((await page.locator("text=Journal enregistré").count()) > 0, "daily log saved (badge or toast)");
    // Missed session prompt (if any)
    const missed = page.locator('form select[name="reason"]').first();
    if (await missed.count()) {
      await missed.selectOption("TIME");
      await page.locator('form:has(select[name="reason"]) button[type="submit"]').first().click();
      await page.waitForLoadState("networkidle");
    }
    // Workout mode
    await page.goto(`${BASE}/app`);
    await settle(page);
    const start = page.locator('a:has-text("Commencer")').first();
    if (await start.count()) {
      await start.click();
      await page.waitForURL(/\/app\/workout\//);
      await settle(page);
      await shot(page, "client-02-workout");
      const headers = page.locator("main ol > li > button[aria-expanded]");
      const hn = await headers.count();
      for (let i = 0; i < hn; i++) {
        const h = headers.nth(i);
        if ((await h.getAttribute("aria-expanded")) !== "true") await h.click();
        const pending = page.locator('button[aria-pressed="false"]');
        while (await pending.count()) await pending.first().click();
      }
      await page.click('button:has-text("Terminer la séance")');
      await page.waitForURL((u) => u.pathname === "/app" && (REMOTE || u.searchParams.has("done")), { timeout: 30000 });
      await shot(page, "client-03-after-workout");
    } else {
      assert(false, "client has no session to start today");
    }
    // Check-in
    await page.goto(`${BASE}/app/checkin`);
    await shot(page, "client-04-checkin");
    if (await page.locator('button:has-text("Envoyer mon check-in")').count()) {
      await page.fill('input[name="wins"]', "3 séances malgré le boulot");
      await page.fill('input[name="struggles"]', "Sommeil difficile");
      await page.click('label:has(input[name="tag:RECOVERY"]) span');
      await page.click('button:has-text("Envoyer mon check-in")');
      await page.waitForURL(/checkin=done/, { timeout: 30000 });
    }
    await page.goto(`${BASE}/app/progress`);
    await shot(page, "client-05-progress");
    {
      // the client adds a photo from the phone (resized in the browser)
      const thumbsBefore = await page.locator('ul[aria-label="Avant / Après"] li').count();
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 400 } });
      await page.click('summary:has-text("Ajouter une photo")');
      await page.setInputFiles('input[type="file"][name="file"]', { name: "selfie.png", mimeType: "image/png", buffer: png });
      await page.waitForSelector('img[alt="Aperçu"]', { timeout: 10000 });
      await page.click('button:has-text("Enregistrer la photo")');
      await waitPhotoSaved(page, thumbsBefore);
      await shot(page, "client-05b-photo-uploaded");
    }
    await page.goto(`${BASE}/app/journey`);
    await shot(page, "client-06-journey");
    await page.goto(`${BASE}/app/messages`);
    await page.fill('textarea[name="body"]', "Merci coach, check-in envoyé !");
    await page.click('button:has-text("Envoyer")');
    await page.waitForLoadState("networkidle");
    await shot(page, "client-07-messages");
    await ctx.close();
    assert(errors.length === 0, `client: console/server errors: ${errors.slice(0, 5).join(" | ")}`);
  }

  // Coach sees the submitted check-in and the client's message
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    lastPage = page;
    await login(page, "coach@coachos.demo", "coach1234");
    const ahmed2 = await clientHref(page, "Ahmed Benali");
    await page.goto(`${BASE}${ahmed2}?tab=checkins`);
    await settle(page);
    assert((await page.locator('button[value="APPROVE"]').count()) > 0, "coach sees pending check-in to approve");
    await shot(page, "desk-17-checkin-pending");
    await page.locator('button[value="APPROVE"]').first().click();
    await page.waitForLoadState("networkidle");
    await page.goto(`${BASE}/messages`);
    assert((await page.locator("text=Merci coach").count()) > 0, "coach sees client message");
    await ctx.close();
  }
} catch (e) {
  failures.push(`crash: ${e?.message?.split("\n")[0] ?? e}`);
  try {
    if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: `${OUT}/zz-failure.png`, fullPage: true });
  } catch {}
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("E2E FAILURES:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("E2E OK — screenshots in " + OUT);
