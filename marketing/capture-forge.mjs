/**
 * CoachOS / COAVEX "Forge" marketing captures: REAL screenshots of the running app (no mockups).
 * This script never builds, never touches .next/src/prisma; it only drives a browser.
 *
 * ── What it expects ───────────────────────────────────────────────────────────
 *  - A production server of the CURRENT code on http://localhost:3210 (or the URL passed as argv[2]).
 *  - That server backed by a FRESHLY SEEDED SQLite file OUTSIDE prisma/ (seed dates are anchored to
 *    "now", and this run writes: generates the weekly review, sends 1 assisted message to Mehdi,
 *    marks 1 action done, logs 3 sets). A reused DB still works but the flow screens differ.
 *  - ANTHROPIC_API_KEY blanked for that server process, so the UI honestly reads
 *    "Composition par règles (IA non configurée)" and no demo data leaves the machine.
 *
 * ── Exact re-run (Git Bash, from coach-os/, after the build is done by whoever owns it) ──
 *   export DB="file:C:/Users/User/AppData/Local/Temp/coachos-capture/fresh.db"   # any ASCII path outside prisma/
 *   mkdir -p /c/Users/User/AppData/Local/Temp/coachos-capture && rm -f /c/Users/User/AppData/Local/Temp/coachos-capture/fresh.db*
 *   DATABASE_URL="$DB" npx prisma db push --skip-generate --schema prisma/schema.prisma
 *   DATABASE_URL="$DB" npx tsx prisma/seed.ts
 *   DATABASE_URL="$DB" ANTHROPIC_API_KEY= node node_modules/next/dist/bin/next start -p 3210 &   # wait for /api/health
 *   node marketing/capture-forge.mjs http://localhost:3210
 *   # then stop the server (it holds the Prisma engine DLL)
 *
 * ── Env ───────────────────────────────────────────────────────────────────────
 *   OUT=<dir>             output folder (default: marketing/shots-<today YYYY-MM-DD>, resolved next to this file)
 *   EXPECT_ACCENT=<hex>   skin guard value (default #c4f538, the Forge lime)
 *
 * Skin guard: reads the computed --accent on /login. If it differs from EXPECT_ACCENT it saves
 * evidence (login + Today) into OUT/_evidence-not-forge/ and exits with code 2 (nothing else captured).
 * Exit 1 = a 5xx / page error / crash (listed in OUT/manifest.json "problems"). Exit 0 = all shots taken.
 *
 * Writes OUT/manifest.json (file, route/state, raw i18n keys detected in the page text).
 * Selectors rely on French UI copy (locale fr-DZ): "Générer", "Assistant de message", "Préparer",
 * "Envoyer dans l'app", "Commencer", "Signaux actifs", "Poids", "Records personnels", and the
 * aria-label "Rechercher". If a rename changes that copy, update the matching line.
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const today = new Date();
const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const BASE = (process.argv[2] || "http://localhost:3210").replace(/\/$/, "");
const OUT = path.resolve(process.env.OUT || path.join(HERE, `shots-${stamp}`));
mkdirSync(OUT, { recursive: true });

const DESK = { width: 1440, height: 900 };
const MOB = { width: 390, height: 844 };
const FORGE_ACCENT = (process.env.EXPECT_ACCENT || "#c4f538").trim().toLowerCase();
const manifest = [];
const problems = [];

function findExecutable() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
  for (const d of dirs)
    for (const rel of ["chrome-win/chrome.exe", "chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win64/chrome.exe"]) {
      const p = path.join(root, d, rel);
      if (existsSync(p)) return p;
    }
  return undefined;
}

async function newCtx(browser, viewport, opts = {}) {
  const mobile = viewport.width < 600;
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: opts.scale ?? 2,
    locale: "fr-DZ",
    // TZID=<IANA> : même fuseau que le serveur (lancé avec TZ=<IANA>) pour capturer un état « matin » quand on capture le soir.
    ...(process.env.TZID ? { timezoneId: process.env.TZID } : {}),
    colorScheme: "dark",
    reducedMotion: "reduce", // no mid-animation frames (the app honours prefers-reduced-motion)
    isMobile: mobile,
    hasTouch: mobile,
  });
  // Forge dark is the default; make sure no stored light-theme preference leaks in.
  await ctx.addInitScript(() => {
    try {
      localStorage.removeItem("coachos:theme");
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message}`));
  return { ctx, page };
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
}

/** Wait until the frame is clean: content, network idle, fonts, no toast, nothing busy. */
async function settle(page) {
  await page.waitForSelector("main h1, main h2, form h1", { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page
    .waitForFunction(() => [...document.querySelectorAll('[role="status"][aria-live]')].every((s) => s.children.length === 0), null, { timeout: 10000 })
    .catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse, form[data-busy]'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function rawKeys(page) {
  const txt = await page.locator("body").innerText().catch(() => "");
  const hits = txt.match(/\b[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+\b/g) || [];
  return [...new Set(hits.filter((h) => !/\.(demo|com|dz|app|net|org|fr|js|png|jpg)$/i.test(h)))];
}

async function shot(page, name, state, { full = false, settleFirst = true, blur = true } = {}) {
  if (settleFirst) await settle(page);
  if (blur) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement !== document.body && document.activeElement.blur()).catch(() => {});
  await page.mouse.move(2, page.viewportSize().height - 2).catch(() => {});
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: full });
  manifest.push({ file, url: page.url().replace(BASE, ""), state, rawKeys: await rawKeys(page) });
  console.log(`[shot] ${file}`);
}

async function elementShot(page, locator, name, state) {
  await locator.scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2).catch(() => {});
  await page.waitForTimeout(250);
  const file = `${name}.png`;
  await locator.screenshot({ path: path.join(OUT, file) });
  const txt = await locator.innerText();
  const hits = (txt.match(/\b[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+\b/g) || []).filter((h) => !/\.(demo|com|dz|app)$/i.test(h));
  manifest.push({ file, url: page.url().replace(BASE, ""), state, rawKeys: [...new Set(hits)], text: txt.replace(/\s+/g, " ").trim() });
  console.log(`[elem] ${file}`);
}

/** Scroll so `locator` sits just under the sticky 56 px header. */
async function scrollTo(page, locator, offset = 72) {
  await locator.evaluate((el, off) => {
    const y = el.getBoundingClientRect().top + window.scrollY - off;
    window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
  }, offset);
  await page.waitForTimeout(300);
}

/** Crop of the viewport around an element (scrolled under the header first, so fixed bars never overlap it). */
async function clipShot(page, locator, name, state, { pad = 16, top = 72 } = {}) {
  await scrollTo(page, locator, top + pad);
  await page.mouse.move(2, 2).catch(() => {});
  const bb = await locator.boundingBox();
  const vp = page.viewportSize();
  const x = Math.max(0, bb.x - pad);
  const y = Math.max(0, bb.y - pad);
  const clip = { x, y, width: Math.min(vp.width - x, bb.width + 2 * pad), height: Math.min(vp.height - y, bb.height + 2 * pad) };
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), clip });
  const txt = await locator.innerText();
  const hits = (txt.match(/\b[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+\b/g) || []).filter((h) => !/\.(demo|com|dz|app)$/i.test(h));
  manifest.push({ file, url: page.url().replace(BASE, ""), state, rawKeys: [...new Set(hits)], clipped: bb.height + 2 * pad > clip.height });
  console.log(`[clip] ${file}`);
}

const signalsSection = (page) => page.locator("main h2", { hasText: "Signaux actifs" }).first().locator("xpath=..");
const setRows = (page) => page.locator('main [role="group"][aria-label]').first().locator("xpath=../..");
const panel = (page, title) => page.locator("main section.rounded-lg").filter({ has: page.locator("header h2", { hasText: title }) }).first();

const queueRow = (page, name) => page.locator('section[aria-labelledby="queue"] ul.enter-stagger > li').filter({ hasText: name }).first();

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: findExecutable() });
} catch {
  browser = await chromium.launch({ headless: true });
}

try {
  // ── 0. Skin guard ──────────────────────────────────────────────────────────
  {
    const { ctx, page } = await newCtx(browser, DESK);
    await page.goto(`${BASE}/login`);
    await settle(page);
    const accent = (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent"))).trim().toLowerCase();
    console.log(`[skin] ${BASE} --accent = ${accent}`);
    if (accent !== FORGE_ACCENT) {
      const ev = path.join(OUT, "_evidence-not-forge");
      mkdirSync(ev, { recursive: true });
      await page.screenshot({ path: path.join(ev, "login.png") });
      await login(page, "coach@coachos.demo", "coach1234");
      await settle(page);
      await page.screenshot({ path: path.join(ev, "today.png") });
      writeFileSync(path.join(ev, "skin.json"), JSON.stringify({ base: BASE, accent, expected: FORGE_ACCENT, at: new Date().toISOString() }, null, 2));
      console.error(`NOT FORGE (accent ${accent}). Evidence in ${ev}`);
      await browser.close();
      process.exit(2);
    }
    await shot(page, "ms01-desk-00-login", "Login screen (anonymous), desktop");
    await ctx.close();
  }

  // ── 1. KOA-MS-01 coach desktop ─────────────────────────────────────────────
  let ahmedHref, mehdiHref;
  {
    const { ctx, page } = await newCtx(browser, DESK);
    await login(page, "coach@coachos.demo", "coach1234");
    await settle(page);
    await shot(page, "ms01-desk-01-today", "Coach Today / command center, top of page (NEXT session hero, PENDING, KPI tiles)");
    await shot(page, "ms01-desk-01-today-full", "Coach Today, full page (hero, pending, KPIs, done strip, attention queue)", { full: true });
    await scrollTo(page, page.locator('section[aria-labelledby="done"]'));
    await shot(page, "ms01-desk-02-today-queue", "Coach Today scrolled to DONE strip + attention queue");

    ahmedHref = (await page.locator('section[aria-labelledby="queue"] a[href^="/clients/"]:has-text("Ahmed Benali")').first().getAttribute("href")).split("?")[0];
    mehdiHref = (await page.locator('section[aria-labelledby="queue"] a[href^="/clients/"]:has-text("Mehdi Saidi")').first().getAttribute("href")).split("?")[0];

    await page.goto(`${BASE}${ahmedHref}`);
    await settle(page);
    await shot(page, "ms01-desk-03-profile-ahmed", "Client profile (Ahmed Benali), overview tab, top: actions with reasons");
    await scrollTo(page, signalsSection(page), 80);
    await shot(page, "ms01-desk-04-profile-ahmed-signals", "Client profile (Ahmed), scrolled to 'Signaux actifs' (observation / why / data / suggested action)");
    await clipShot(page, signalsSection(page), "ms01-desk-04b-profile-ahmed-signals-crop", "Crop: Ahmed's 'Signaux actifs' column only (first cards, cut at viewport bottom)");

    await page.goto(`${BASE}/review`);
    await settle(page);
    if (!(await page.locator('button[value="APPROVED"]').count())) {
      const gen = page.locator('button:has-text("Générer")').first();
      if (await gen.count()) {
        await gen.click();
        await page.waitForSelector("form[data-busy]", { timeout: 5000 }).catch(() => {});
        await page.waitForSelector("form[data-busy]", { state: "detached", timeout: 120000 });
        await page.waitForSelector('button[value="APPROVED"]', { timeout: 60000 });
      }
    }
    await shot(page, "ms01-desk-05-review", "Weekly review generated (per-client items with Approve / Edit / Follow-up / Ignore)");
    await shot(page, "ms01-desk-05-review-full", "Weekly review generated, full page", { full: true });

    // Command palette
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.locator("body").click({ position: { x: 700, y: 12 } });
    await page.keyboard.press("Control+K");
    if (!(await page.waitForSelector("[cmdk-input]", { timeout: 5000 }).then(() => true).catch(() => false))) {
      await page.click('button[aria-label="Rechercher"]');
      await page.waitForSelector("[cmdk-input]", { timeout: 5000 });
    }
    await page.waitForTimeout(500);
    await shot(page, "ms01-desk-08a-palette-open", "Command palette opened with Ctrl+K (recents, actions, pages)", { settleFirst: false, blur: false });
    await page.keyboard.type("sara");
    await page.waitForSelector("[cmdk-item]", { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "ms01-desk-08b-palette-search", 'Command palette, query "sara"', { settleFirst: false, blur: false });
    await page.keyboard.press("Escape");

    // Coach workout mode (Today's NEXT session)
    await page.goto(`${BASE}/`);
    await settle(page);
    const trainHref = await page.locator('main a[href*="/train/"]').first().getAttribute("href");
    await page.goto(`${BASE}${trainHref}`);
    await settle(page);
    await shot(page, "ms01-desk-07-coach-workout", "Coach workout mode (live session logging), start state");
    const checks = page.locator('button[aria-pressed="false"]');
    for (let i = 0; i < 2 && (await checks.count()); i++) await checks.first().click();
    await page.waitForSelector('[role="timer"]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await scrollTo(page, page.locator("main ol").first(), 80);
    await shot(page, "ms01-desk-07b-coach-workout-logging", "Coach workout mode after 2 sets logged (rest timer running)", { settleFirst: false });
    await clipShot(page, setRows(page), "ms01-desk-07c-coach-workout-sets-crop", "Crop: coach workout set rows (reps / load steppers, 2 sets checked)", { top: 140 });
    await ctx.close();
  }

  // ── 2. KOA-MS-02 isolated attention / signal cards (scale 3) ───────────────
  {
    const { ctx, page } = await newCtx(browser, DESK, { scale: 3 });
    await login(page, "coach@coachos.demo", "coach1234");
    await settle(page);
    await elementShot(page, queueRow(page, "Ahmed Benali"), "ms02-attention-card-ahmed", "Attention-queue card, Ahmed Benali (element, scale 3)");
    await elementShot(page, queueRow(page, "Mehdi Saidi"), "ms02-attention-card-mehdi", "Attention-queue card, Mehdi Saidi (element, scale 3)");
    await page.goto(`${BASE}${ahmedHref}`);
    await settle(page);
    const art = page.locator("main article");
    const withAction = art.filter({ has: page.locator("svg.lucide-zap") });
    await elementShot(page, (await withAction.count()) ? withAction.first() : art.first(), "ms02-signal-card-ahmed", "Signal card on Ahmed's profile: observation / why / data / suggested action (element, scale 3)");
    await page.goto(`${BASE}${mehdiHref}`);
    await settle(page);
    const art2 = page.locator("main article").filter({ has: page.locator("svg.lucide-zap") });
    if (await art2.count()) await elementShot(page, art2.first(), "ms02-signal-card-mehdi", "Signal card on Mehdi's profile (element, scale 3)");
    await ctx.close();
  }
  {
    // Narrower layout (720 px wide) → a card with a social-friendly aspect ratio
    const { ctx, page } = await newCtx(browser, { width: 720, height: 900 }, { scale: 3 });
    await login(page, "coach@coachos.demo", "coach1234");
    await settle(page);
    await clipShot(page, queueRow(page, "Ahmed Benali"), "ms02-attention-card-ahmed-narrow", "Attention-queue card, Ahmed Benali, 720 px layout (crop, scale 3)", { pad: 0, top: 80 });
    await clipShot(page, queueRow(page, "Mehdi Saidi"), "ms02-attention-card-mehdi-narrow", "Attention-queue card, Mehdi Saidi, 720 px layout (crop, scale 3)", { pad: 0, top: 80 });
    await ctx.close();
  }

  // ── 3. Strongest workflow (desktop): queue → client → why → draft → send → done ──
  {
    const { ctx, page } = await newCtx(browser, DESK);
    await login(page, "coach@coachos.demo", "coach1234");
    await settle(page);
    await scrollTo(page, page.locator('section[aria-labelledby="queue"]'));
    await shot(page, "flow-01-morning-queue", "Flow 1: Today, attention queue (Ahmed, Mehdi at the top)");

    await queueRow(page, "Mehdi Saidi").locator('a[href^="/clients/"]:has-text("Mehdi Saidi")').click();
    await page.waitForURL((u) => u.pathname === mehdiHref, { timeout: 30000 });
    await settle(page);
    await shot(page, "flow-02-open-client", "Flow 2: Mehdi Saidi profile, overview (suggested actions with reasons)");

    await scrollTo(page, signalsSection(page), 80);
    await shot(page, "flow-03-why-signals", "Flow 3: Mehdi, 'Signaux actifs' explaining why (observation / why / data / action)");

    // Follow the suggested action that leads to the conversation, else open it directly
    const toMsg = page.locator(`main a[href="/messages/${mehdiHref.split("/").pop()}"]`).first();
    if (await toMsg.count()) await toMsg.click();
    else await page.goto(`${BASE}/messages/${mehdiHref.split("/").pop()}`);
    await page.waitForURL(/\/messages\//, { timeout: 30000 });
    await settle(page);
    await page.click('button:has-text("Assistant de message")');
    const sit = page.locator("form select").first();
    await sit.selectOption("RE_ENGAGE").catch(() => {});
    await page.click('button:has-text("Préparer")');
    await page.waitForFunction(() => (document.querySelector('textarea[name="body"]')?.value ?? "").length > 20, null, { timeout: 30000 });
    const draft = await page.locator('textarea[name="body"]').inputValue();
    await shot(page, "flow-04-message-draft", "Flow 4: conversation with Mehdi, message assistant draft (rule composer, situation 'Reprendre contact', not sent yet)");
    await shot(page, "ms01-desk-06-composer-draft", "Message composer with assisted draft (rule-based), Mehdi Saidi", { settleFirst: false });

    await page.click('button:has-text("Envoyer dans l\'app")');
    await page.waitForFunction((start) => [...document.querySelectorAll("main p.whitespace-pre-wrap")].some((p) => p.textContent.startsWith(start)), draft.slice(0, 30), { timeout: 30000 }).catch(() => {});
    await settle(page);
    await shot(page, "flow-05-message-sent", "Flow 5: message sent in-app, visible in the thread (assisted marker)");

    await page.goto(`${BASE}/`);
    await settle(page);
    const row = queueRow(page, "Mehdi Saidi");
    let marked = false;
    if (await row.count()) {
      const done = row.locator('button[value="DONE"]').first();
      if (await done.count()) {
        await done.click();
        await page.waitForSelector('[role="status"][aria-live] > *', { timeout: 10000 }).catch(() => {});
        marked = true;
      }
    }
    await settle(page);
    await scrollTo(page, page.locator('section[aria-labelledby="done"]'));
    await shot(page, "flow-06-marked-done", `Flow 6: back on Today after marking Mehdi's next action done (${marked ? "Done clicked" : "no open action left"}); DONE strip + queue`);
    await ctx.close();
  }

  // ── 4. Coach mobile ────────────────────────────────────────────────────────
  {
    const { ctx, page } = await newCtx(browser, MOB);
    await login(page, "coach@coachos.demo", "coach1234");
    await settle(page);
    await shot(page, "ms01-mob-01-today", "Coach Today on phone, top");
    // (no full-page on phones: the fixed bottom nav would be painted mid-page)
    await scrollTo(page, page.locator('section[aria-labelledby="queue"]'), 64);
    await shot(page, "ms01-mob-01b-today-queue", "Coach Today on phone, scrolled to the attention queue");
    await page.goto(`${BASE}${ahmedHref}`);
    await settle(page);
    await shot(page, "ms01-mob-02-profile-ahmed", "Client profile (Ahmed) on phone, top");
    await ctx.close();
  }

  // ── 5. Client app (mobile) — Sara (streak + PR scenario) ────────────────────
  {
    const { ctx, page } = await newCtx(browser, MOB);
    await login(page, "sara@coachos.demo", "client1234");
    await settle(page);
    await shot(page, "ms01-client-01-today", "Client app Today (Sara), top");
    await clipShot(page, page.locator('main [aria-labelledby="today-workout-h"]').first(), "ms01-client-01c-today-session-card", "Crop: client Today 'Séance du jour' card (Sara)", { top: 64 });
    const start = page.locator('a:has-text("Commencer")').first();
    if (await start.count()) {
      await start.click();
      await page.waitForURL(/\/app\/workout\//, { timeout: 30000 });
      await settle(page);
      await shot(page, "ms01-client-02-workout", "Client workout mode (Sara), start state");
      const checks = page.locator('button[aria-pressed="false"]');
      if (await checks.count()) await checks.first().click();
      await page.waitForSelector('[role="timer"]', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      await scrollTo(page, page.locator("main ol").first(), 64);
      await shot(page, "ms01-client-02b-workout-logging", "Client workout mode (Sara) after logging 1 set (rest timer)", { settleFirst: false });
      await clipShot(page, setRows(page), "ms01-client-02c-workout-sets-crop", "Crop: client workout set rows (Sara, 1 set checked)", { top: 150 });
    }
    await page.goto(`${BASE}/app/progress`);
    await settle(page);
    await shot(page, "ms01-client-03-progress", "Client progress (Sara), top");
    await clipShot(page, panel(page, "Poids"), "ms01-client-03c-progress-weight-crop", "Crop: client progress 'Poids' panel (Sara)", { top: 64 });
    await clipShot(page, panel(page, "Records personnels"), "ms01-client-03d-progress-prs-crop", "Crop: client progress 'Records personnels' panel (Sara)", { top: 64 });
    await ctx.close();
  }
} catch (e) {
  problems.push(`crash: ${e?.stack?.split("\n").slice(0, 3).join(" | ") ?? e}`);
} finally {
  await browser.close();
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), shots: manifest, problems }, null, 2));
}
if (problems.length) {
  console.error("PROBLEMS:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`OK — ${manifest.length} shots in ${OUT}`);
