const { chromium } = require("playwright");
const { normalizeToken } = require("./filters");

const API_KEYWORD = "/api/v1/rank/sol/swaps/";
const TARGET_URL = "https://gmgn.ai/trend?chain=sol";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

function log(level, message, meta) {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (meta === undefined) {
    console.log(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`, meta);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data?.rank,
    payload?.data?.list,
    payload?.data?.pairs,
    payload?.data?.tokens,
    payload?.data,
    payload?.pairs,
    payload?.list,
    payload?.tokens,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function classifyTimeframe(url) {
  const match = url.match(/\/swaps\/(\w+)/);
  return match ? match[1] : "unknown";
}

async function safeClick(page, selector, label, timeout = 3000, force = false) {
  try {
    await page.click(selector, { timeout, force });
    log("info", `[CLICK] '${label}' clicked.`);
    await delay(1000);
    return true;
  } catch {
    log("info", `[CLICK] '${label}' not found / already dismissed.`);
    return false;
  }
}

async function safeFill(page, selector, value, label) {
  try {
    await page.fill(selector, String(value), { timeout: 3000 });
    log("info", `[FILL] '${label}' set to ${value}.`);
    await delay(500);
    return true;
  } catch {
    log("warn", `[FILL] '${label}' failed.`);
    return false;
  }
}

// ── Persistent browser session ─────────────────────────────────────

let _browser = null;
let _context = null;
let _page = null;
let _initialized = false;
let _capturedResponses = new Map();

/**
 * Dismiss all GMGN onboarding/update modals.
 * The modal uses class "pi-modal-wrap pi-modal-centered" and blocks clicks on page elements.
 * We use force:true to click through the overlay and scope selectors to the modal.
 */
async function dismissAllModals(page) {
  log("info", "Dismissing any onboarding/update modals...");

  for (let attempt = 0; attempt < 8; attempt++) {
    // Check if a modal is visible
    const modalVisible = await page
      .locator(".pi-modal-wrap")
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (!modalVisible) {
      log("info", "No more modals visible.");
      break;
    }

    log("info", `Modal detected (attempt ${attempt + 1}), trying to dismiss...`);

    // Try clicking buttons inside the modal with force:true
    const buttonLabels = ["Next", "Finish", "Got it", "OK", "Close", "Skip"];
    let dismissed = false;

    for (const label of buttonLabels) {
      try {
        // Scope to modal container and use force click to bypass overlay
        const btn = page.locator(`.pi-modal-wrap >> text="${label}"`).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click({ force: true, timeout: 3000 });
          log("info", `[MODAL] '${label}' clicked.`);
          dismissed = true;
          await delay(1500);
          break;
        }
      } catch {
        // Try next label
      }
    }

    // If no button found, try closing the modal via close icon
    if (!dismissed) {
      try {
        const closeBtn = page.locator(".pi-modal-close").first();
        if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await closeBtn.click({ force: true, timeout: 3000 });
          log("info", "[MODAL] Close icon clicked.");
          dismissed = true;
          await delay(1500);
        }
      } catch {
        // ignore
      }
    }

    // Last resort: remove the modal from DOM via JS
    if (!dismissed) {
      try {
        await page.evaluate(() => {
          document
            .querySelectorAll(".pi-modal-root, .pi-modal-mask")
            .forEach((el) => el.remove());
        });
        log("info", "[MODAL] Removed modal from DOM via JS.");
        await delay(1000);
      } catch {
        log("warn", "[MODAL] Could not remove modal via JS.");
      }
      break;
    }
  }

  await delay(1000);
}

async function ensureBrowser(config) {
  if (_browser && _browser.isConnected() && _page && !_page.isClosed()) {
    return _page;
  }

  // Clean up old session
  await closeBrowser();

  log("info", "Launching persistent Playwright browser...");

  _browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  });

  _context = await _browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: USER_AGENT,
  });

  _page = await _context.newPage();
  _capturedResponses = new Map();

  // ── Network intercept (only capture configured timeframes) ──
  _page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes(API_KEYWORD)) return;

    const timeframe = classifyTimeframe(url);
    const status = response.status();

    // Skip timeframes we don't care about
    if (!config.timeframes.includes(timeframe)) return;
    if (status !== 200) return;

    try {
      const body = await response.json();
      _capturedResponses.set(timeframe, { data: body, capturedAt: Date.now() });
      const rows = extractRows(body);
      log("info", `[NET] Captured ${timeframe}: ${rows.length} tokens.`);
    } catch (ex) {
      log("warn", `[NET] JSON parse failed for ${timeframe}: ${ex.message}`);
    }
  });

  // ── Navigate ──
  log("info", `Opening: ${TARGET_URL}`);
  await _page.goto(TARGET_URL, { timeout: 90000, waitUntil: "domcontentloaded" });
  log("info", `Page loaded. Title: ${await _page.title()}`);
  await delay(5000);

  // ── Dismiss onboarding / update popups ──
  await dismissAllModals(_page);

  // ── Wait for page to stabilize ──
  try {
    await _page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    log("info", "Network did not fully idle, continuing...");
  }

  // ── Apply filters via UI ──
  await applyGmgnFilters(_page, config);

  _initialized = true;
  log("info", "Persistent browser session ready.");

  return _page;
}

async function applyGmgnFilters(page, config) {
  log("info", "Applying GMGN UI filters...");

  // Nuke any lingering modals first
  await page.evaluate(() => {
    document.querySelectorAll('.pi-modal-root, .pi-modal-mask, .pi-modal-wrap').forEach(el => el.remove());
  }).catch(() => {});
  await delay(500);

  // Filter button is a <span> with text "Filter"
  const filterOpened = await safeClick(page, "span:text-is('Filter')", "Filter", 5000, true);
  if (!filterOpened) {
    const fallback = await safeClick(page, "//span[text()='Filter']", "Filter (XPath)", 5000, true);
    if (!fallback) {
      log("warn", "Could not open Filter panel.");
      return;
    }
  }
  await delay(2000);

  // Checkboxes
  await safeClick(page, "text=NoMint", "NoMint checkbox", 3000);
  await safeClick(page, "text=No Blacklist", "No Blacklist checkbox", 3000);
  await delay(500);

  // MC Min
  await safeFill(page, "(//input[@placeholder='Min'])[3]", config.minMarketCap / 1000, "MC Min (K)");
  // 1h Vol Min
  await safeFill(page, "(//input[@placeholder='Min'])[5]", config.minVolume1h / 1000, "1h Vol Min (K)");
  // Total Fees Min
  await safeFill(page, "(//input[@placeholder='Min'])[7]", config.minTotalFeesSol, "Total Fees Min (SOL)");
  // Holders Min
  await safeFill(page, "(//input[@placeholder='Min'])[9]", config.minHolders, "Holders Min");

  await delay(500);
  await safeClick(page, "text=Apply", "Apply", 5000);
  await delay(2000);

  log("info", "GMGN UI filters applied.");
}

async function closeBrowser() {
  _initialized = false;
  if (_page && !_page.isClosed()) {
    await _page.close().catch(() => {});
  }
  if (_context) {
    await _context.close().catch(() => {});
  }
  if (_browser) {
    await _browser.close().catch(() => {});
  }
  _page = null;
  _context = null;
  _browser = null;
  _capturedResponses = new Map();
}

// ── Fetch trending (click tabs to preserve filters) ──────────────

async function fetchTrendingTokens(config) {
  let page;
  try {
    page = await ensureBrowser(config);
  } catch (err) {
    log("error", `Browser init failed: ${err.message}. Retrying...`);
    await closeBrowser();
    page = await ensureBrowser(config);
  }

  const allTokens = [];

  for (const timeframe of config.timeframes) {
    // Clear previous capture for fresh data
    _capturedResponses.delete(timeframe);

    // First, nuke any lingering modals that might block clicks
    await page.evaluate(() => {
      document.querySelectorAll('.pi-modal-root, .pi-modal-mask, .pi-modal-wrap').forEach(el => el.remove());
    }).catch(() => {});

    // Click the timeframe tab with force:true to bypass any overlay
    log("info", `Clicking ${timeframe} tab...`);
    try {
      const tabLocator = page.locator(`div`).locator(`text="${timeframe}"`).first();
      await tabLocator.click({ force: true, timeout: 10000 });
      log("info", `[CLICK] '${timeframe}' tab clicked (force).`);
    } catch (err) {
      log("warn", `Could not click ${timeframe} tab (primary): ${err.message}`);
      try {
        await page.click(`//div[text()='${timeframe}']`, { timeout: 5000, force: true });
        log("info", `[CLICK] '${timeframe}' tab clicked (XPath force).`);
      } catch {
        log("error", `Failed to click ${timeframe} tab entirely. Skipping.`);
        continue;
      }
    }

    // Wait for API response via waitForResponse (more reliable than polling)
    log("info", `Waiting for API response for ${timeframe}...`);
    try {
      await page.waitForResponse(
        (resp) =>
          resp.url().includes(API_KEYWORD) &&
          resp.url().includes(`/swaps/${timeframe}`) &&
          resp.status() === 200,
        { timeout: 25000 }
      );
      // Small delay to let the response handler process it
      await delay(1000);
    } catch {
      log("warn", `⚠️ waitForResponse timed out for ${timeframe}.`);
    }

    // Fallback: also check captured map (response handler may have caught it)
    if (!_capturedResponses.has(timeframe)) {
      // Extra wait in case of slow processing
      await delay(3000);
    }

    const captured = _capturedResponses.get(timeframe);
    if (captured) {
      const rows = extractRows(captured.data);
      log("info", `✅ Got ${rows.length} tokens for ${timeframe}.`);

      const tokens = rows.map((row) =>
        normalizeToken(
          {
            ...row,
            gmgnUrl: `${config.gmgnTokenBaseUrl}/${
              row.address ||
              row.ca ||
              row.contractAddress ||
              row.contract_address ||
              row.tokenAddress ||
              row.token_address ||
              row.mint ||
              row.base_mint ||
              ""
            }`,
          },
          timeframe
        )
      );
      allTokens.push(...tokens);
    } else {
      log("warn", `⚠️ No API response for ${timeframe} after waiting.`);

      // If page might be stale, mark for re-init on next cycle
      if (!_browser || !_browser.isConnected()) {
        log("warn", "Browser disconnected, will re-init next cycle.");
        await closeBrowser();
      }
    }

    // Small gap between tabs to avoid rate limiting
    await delay(2000);
  }

  return allTokens;
}

module.exports = {
  fetchTrendingTokens,
  closeBrowser,
  log,
};
