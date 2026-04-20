const crypto = require("crypto");
const { normalizeToken } = require("./filters");
const { log } = require("./logger");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRows(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidates = [
    payload?.data?.data?.rank,
    payload?.data?.data?.list,
    payload?.data?.rank,
    payload?.data?.list,
    payload?.data?.pairs,
    payload?.data?.tokens,
    payload?.data,
    payload?.rank,
    payload?.list,
    payload?.pairs,
    payload?.tokens,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function buildAuthQuery() {
  return {
    timestamp: Math.floor(Date.now() / 1000),
    client_id: crypto.randomUUID(),
  };
}

function buildUrl(base, path, query) {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        url.searchParams.append(key, String(v));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function gmgnGet(config, path, query = {}, { retries = 3 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const signed = buildAuthQuery();
    const url = buildUrl(config.gmgnApiHost, path, { ...query, ...signed });

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-APIKEY": config.gmgnApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(config.gmgnRequestTimeoutMs),
      });

      const rawText = await response.text();
      let json;
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(`Non-JSON response from GMGN (${response.status})`);
      }

      if (!response.ok || (json && typeof json === "object" && Number(json.code) && Number(json.code) !== 0)) {
        const errMsg = json?.message || json?.error || `HTTP ${response.status}`;

        // Respect rate limit reset if provided
        if (response.status === 429 && attempt < retries) {
          const resetUnix = Number(response.headers.get("x-ratelimit-reset") || json?.reset_at || 0);
          if (Number.isFinite(resetUnix) && resetUnix > 0) {
            const waitMs = Math.max(resetUnix * 1000 - Date.now() + 1000, 1000);
            log("warn", `GMGN rate limited. Waiting ${Math.ceil(waitMs / 1000)}s before retry...`);
            await delay(waitMs);
            continue;
          }
        }

        throw new Error(`GMGN API error: ${errMsg}`);
      }

      return json;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 5000);
        log("warn", `GMGN request retry ${attempt}/${retries}: ${error.message}`);
        await delay(backoff);
        continue;
      }
    }
  }

  throw lastError || new Error("Unknown GMGN API error");
}

async function fetchTrendingByInterval(config, interval) {
  const payload = await gmgnGet(
    config,
    "/v1/market/rank",
    {
      chain: config.gmgnChain,
      interval,
      limit: config.gmgnRankLimit,
      order_by: "volume",
      direction: "desc",
    },
    { retries: config.retryAttempts }
  );

  const rows = extractRows(payload);
  return rows
    .map((row) => normalizeToken(row, interval))
    .filter((token) => Boolean(token.address));
}

async function fetchTokenKolHolders(config, tokenAddress, { limit = 10 } = {}) {
  try {
    const payload = await gmgnGet(
      config,
      "/v1/market/token_top_holders",
      {
        chain: config.gmgnChain,
        address: tokenAddress,
        tag: "renowned",
        order_by: "amount_percentage",
        direction: "desc",
        limit,
      },
      { retries: 2 }
    );

    const holders =
      payload?.data?.list ||
      payload?.data?.holders ||
      payload?.list ||
      payload?.holders ||
      payload?.data ||
      [];

    if (!Array.isArray(holders)) return [];

    return holders.map((h) => ({
      address: h.address || h.wallet_address || "",
      name: h.name || h.tag || h.twitter_name || h.twitter_username || "",
      initBuyUsd: h.buy_volume_cur || h.total_cost || h.cost || 0,
      remainingTokens: h.amount_cur || h.balance || h.holding || 0,
      remainingUsd: h.usd_value || h.value || 0,
      amountPercentage: h.amount_percentage || 0,
      profit: h.profit || h.realized_profit || 0,
      unrealizedProfit: h.unrealized_profit || 0,
    }));
  } catch (error) {
    log("warn", `KOL holders fetch failed for ${tokenAddress.slice(0, 10)}...: ${error.message}`);
    return [];
  }
}

async function fetchTrendingTokens(config) {
  const results = [];

  for (const timeframe of config.timeframes) {
    try {
      const tokens = await fetchTrendingByInterval(config, timeframe);
      log("info", `Fetched ${tokens.length} ${timeframe} tokens from GMGN OpenAPI.`);
      results.push(...tokens);
    } catch (error) {
      log("warn", `Failed ${timeframe} fetch: ${error.message}`);
    }
  }

  if (results.length === 0) {
    throw new Error("No tokens returned from GMGN OpenAPI for all configured intervals.");
  }

  return results;
}

async function closeBrowser() {
  // Legacy no-op kept for backward compatibility with existing index.js lifecycle hooks.
}

module.exports = {
  fetchTrendingTokens,
  fetchTokenKolHolders,
  closeBrowser,
  log,
};
