const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function readNumber(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number.`);
  }

  return parsed;
}

const config = {
  discordToken: process.env.DISCORD_TOKEN || "",
  discordChannelId: process.env.DISCORD_CHANNEL_ID || "",
  discordMentionRoleId: process.env.DISCORD_MENTION_ROLE_ID || "",
  checkIntervalMs: readNumber("CHECK_INTERVAL_MS", 30000),
  minMarketCap: readNumber("MIN_MARKET_CAP", 200000),
  minVolume1h: readNumber("MIN_VOLUME_1H", 50000),
  minTotalFeesSol: readNumber("MIN_TOTAL_FEES_SOL", 20),
  minHolders: readNumber("MIN_HOLDERS", 500),
  alertDedupMs: 60 * 60 * 1000,
  dryRun:
    String(process.env.DRY_RUN || "").toLowerCase() === "true" ||
    process.argv.includes("--dry-run"),
  timeframes: ["1m", "5m"],
  gmgnApiBaseUrl: "https://gmgn.ai/defi/quotation/v1/rank/sol/swaps",
  gmgnTrendingBaseUrl: "https://gmgn.ai/trend?chain=sol",
  gmgnBrowserApiBaseUrl: "https://gmgn.ai/api/v1/rank/sol/swaps",
  gmgnTokenBaseUrl: "https://gmgn.ai/sol/token",
  retryAttempts: 3,
  userDataDir: path.join(process.cwd(), ".puppeteer-cache"),
};

function validateConfig() {
  if (config.dryRun) {
    return;
  }

  const missing = [];
  if (!config.discordToken) {
    missing.push("DISCORD_TOKEN");
  }
  if (!config.discordChannelId) {
    missing.push("DISCORD_CHANNEL_ID");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  config,
  validateConfig,
};
