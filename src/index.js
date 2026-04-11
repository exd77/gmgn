const { Client, GatewayIntentBits } = require("discord.js");
const { config, validateConfig } = require("./config");
const { filterTokens, mergeTokens, rankTokens } = require("./filters");
const { formatConsoleToken, formatTokenEmbed, buildButtons } = require("./formatter");
const { fetchTrendingTokens, closeBrowser, log } = require("./scraper");
const { fetchMeteoraPools } = require("./meteora");

const alertedTokens = new Map();

process.on("unhandledRejection", (error) => {
  log("error", `Unhandled rejection: ${error?.stack || error}`);
});

process.on("uncaughtException", (error) => {
  log("error", `Uncaught exception: ${error?.stack || error}`);
});

// Graceful shutdown — close persistent browser
async function shutdown() {
  log("info", "Shutting down...");
  await closeBrowser();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function cleanupAlertCache() {
  const now = Date.now();
  for (const [address, timestamp] of alertedTokens.entries()) {
    if (now - timestamp > config.alertDedupMs) {
      alertedTokens.delete(address);
    }
  }
}

function getNewAlerts(tokens) {
  const now = Date.now();
  return tokens.filter((token) => {
    const lastAlertAt = alertedTokens.get(token.address) || 0;
    return now - lastAlertAt >= config.alertDedupMs;
  });
}

function markAlerted(tokens) {
  const now = Date.now();
  for (const token of tokens) {
    alertedTokens.set(token.address, now);
  }
}

async function enrichWithMeteora(tokens) {
  const enriched = [];
  for (const token of tokens) {
    try {
      const meteoraData = await fetchMeteoraPools(token.address);
      enriched.push({ ...token, meteoraData });
    } catch (err) {
      log("warn", `Meteora fetch failed for ${token.symbol}: ${err.message}`);
      enriched.push({ ...token, meteoraData: null });
    }
  }
  return enriched;
}

async function runCheck(client) {
  cleanupAlertCache();
  log("info", "Starting GMGN trending check.");

  const rawTokens = await fetchTrendingTokens(config);
  const mergedTokens = mergeTokens(rawTokens).map((token) => ({
    ...token,
    gmgnUrl: token.gmgnUrl || `${config.gmgnTokenBaseUrl}/${token.address}`,
  }));
  const filteredTokens = filterTokens(mergedTokens, config);
  const rankedTokens = rankTokens(filteredTokens);
  const freshTokens = getNewAlerts(rankedTokens);

  if (freshTokens.length === 0) {
    log("info", "No new tokens passed filters.");
    return;
  }

  // Enrich with Meteora data
  const enrichedTokens = await enrichWithMeteora(freshTokens);

  if (config.dryRun) {
    log("info", `Dry run: ${enrichedTokens.length} tokens would be posted.`);
    for (const [index, token] of enrichedTokens.entries()) {
      console.log(formatConsoleToken(token, index));
    }
    markAlerted(enrichedTokens);
    return;
  }

  const channel = await client.channels.fetch(config.discordChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Configured Discord channel is not a text channel.");
  }

  for (const token of enrichedTokens) {
    const mentionContent = config.discordMentionRoleId
      ? `<@&${config.discordMentionRoleId}>`
      : undefined;

    await channel.send({
      content: mentionContent,
      embeds: [formatTokenEmbed(token)],
      components: [buildButtons(token, token.meteoraData)],
    });
  }

  markAlerted(enrichedTokens);
  log("info", `Posted ${enrichedTokens.length} token alerts to Discord.`);
}

async function main() {
  validateConfig();

  if (config.dryRun) {
    await runCheck(null);
    await closeBrowser();
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", async () => {
    log("info", `Discord bot logged in as ${client.user.tag}.`);

    // Initial check
    try {
      await runCheck(client);
    } catch (error) {
      log("error", `Initial check failed: ${error.stack || error.message}`);
    }

    // Fast polling — browser stays open, just clicks tabs
    setInterval(async () => {
      try {
        await runCheck(client);
      } catch (error) {
        log("error", `Scheduled check failed: ${error.stack || error.message}`);
      }
    }, config.checkIntervalMs);
  });

  client.on("error", (error) => {
    log("error", `Discord client error: ${error.stack || error.message}`);
  });

  await client.login(config.discordToken);
}

main().catch(async (error) => {
  log("error", error.stack || error.message);
  await closeBrowser();
  process.exitCode = 1;
});
