const path = require("path");
const os = require("os");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(os.homedir(), ".config", "gmgn", ".env") });
dotenv.config({ override: true });

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
  timeframes: String(process.env.GMGN_INTERVALS || "5m,1h")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  gmgnApiKey: process.env.GMGN_API_KEY || "",
  gmgnApiHost: process.env.GMGN_API_HOST || "https://openapi.gmgn.ai",
  gmgnChain: process.env.GMGN_CHAIN || "sol",
  gmgnRankLimit: readNumber("GMGN_RANK_LIMIT", 100),
  gmgnRequestTimeoutMs: readNumber("GMGN_REQUEST_TIMEOUT_MS", 15000),
  gmgnTokenBaseUrl: "https://gmgn.ai/sol/token",
  retryAttempts: readNumber("GMGN_RETRY_ATTEMPTS", 3),
  kolHoldersLimit: readNumber("GMGN_KOL_HOLDERS_LIMIT", 30),
  userDataDir: path.join(process.cwd(), ".puppeteer-cache"),
};

function validateConfig() {
  const missing = [];

  if (!config.gmgnApiKey) {
    missing.push("GMGN_API_KEY");
  }

  if (!config.dryRun) {
    if (!config.discordToken) {
      missing.push("DISCORD_TOKEN");
    }
    if (!config.discordChannelId) {
      missing.push("DISCORD_CHANNEL_ID");
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  config,
  validateConfig,
};
