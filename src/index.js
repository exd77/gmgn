const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");
const { config, validateConfig } = require("./config");
const { filterTokens, mergeTokens, rankTokens } = require("./filters");
const { formatConsoleToken, formatTokenEmbed, buildButtons } = require("./formatter");
const { fetchTrendingTokens, fetchTokenKolHolders, closeBrowser, log } = require("./scraper");
const { fetchMeteoraPools } = require("./meteora");

const alertedTokens = new Map();
const kolTokenCache = new Map();
const sentTokenStorePath = path.join(process.cwd(), "data", "sent-tokens.json");
const sentTokens = new Set();

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

function loadSentTokens() {
  try {
    if (!fs.existsSync(sentTokenStorePath)) {
      return;
    }

    const raw = fs.readFileSync(sentTokenStorePath, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.tokens) ? parsed.tokens : [];

    for (const address of items) {
      if (typeof address === "string" && address.trim()) {
        sentTokens.add(address);
      }
    }

    log("info", `Loaded ${sentTokens.size} previously sent token(s).`);
  } catch (error) {
    log("warn", `Failed loading sent token store: ${error?.message || error}`);
  }
}

function persistSentTokens() {
  try {
    fs.mkdirSync(path.dirname(sentTokenStorePath), { recursive: true });
    fs.writeFileSync(
      sentTokenStorePath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          tokens: [...sentTokens],
        },
        null,
        2
      )
    );
  } catch (error) {
    log("warn", `Failed persisting sent token store: ${error?.message || error}`);
  }
}

function markSent(tokens) {
  let changed = false;
  for (const token of tokens) {
    if (!token?.address) continue;
    if (!sentTokens.has(token.address)) {
      sentTokens.add(token.address);
      changed = true;
    }
  }

  if (changed) {
    persistSentTokens();
  }
}

function cleanupAlertCache() {
  const now = Date.now();
  for (const [address, timestamp] of alertedTokens.entries()) {
    if (now - timestamp > config.alertDedupMs) {
      alertedTokens.delete(address);
    }
  }

  for (const [address, entry] of kolTokenCache.entries()) {
    if (!entry?.timestamp || now - entry.timestamp > config.alertDedupMs) {
      kolTokenCache.delete(address);
    }
  }
}

function getNewAlerts(tokens) {
  const now = Date.now();
  return tokens.filter((token) => {
    if (!token?.address) return false;
    if (sentTokens.has(token.address)) return false;

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

  // Enrich with KOL holder list
  for (const token of enrichedTokens) {
    try {
      token.kolHolders = await fetchTokenKolHolders(config, token.address, { limit: config.kolHoldersLimit });
      log("info", `Fetched ${token.kolHolders.length} KOL holders for ${token.symbol}`);
    } catch (err) {
      log("warn", `KOL holders failed for ${token.symbol}: ${err.message}`);
      token.kolHolders = [];
    }
  }

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

  let posted = 0;
  const postedTokens = [];

  for (const token of enrichedTokens) {
    const mentionContent = config.discordMentionRoleId
      ? `<@&${config.discordMentionRoleId}>`
      : undefined;

    try {
      const { embed, kolPage, kolTotalPages } = formatTokenEmbed(token, { kolPage: 0, kolPageSize: 5 });
      kolTokenCache.set(token.address, { token, timestamp: Date.now() });

      await channel.send({
        content: mentionContent,
        embeds: [embed],
        components: buildButtons(token, token.meteoraData, { kolPage, kolTotalPages }),
      });

      posted += 1;
      postedTokens.push(token);
    } catch (error) {
      log("error", `Send failed for ${token.symbol} (${token.address}): ${error?.stack || error?.message || error}`);
    }
  }

  markAlerted(postedTokens);
  markSent(postedTokens);
  log("info", `Posted ${posted}/${enrichedTokens.length} token alerts to Discord.`);
}

async function main() {
  loadSentTokens();
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

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("kol:")) return;

    const [, address, pageRaw] = interaction.customId.split(":");
    const entry = kolTokenCache.get(address);

    if (!entry?.token) {
      await interaction.reply({ content: "Data KOL udah expired, tunggu alert berikutnya ya.", ephemeral: true });
      return;
    }

    const page = Number(pageRaw);
    const safePage = Number.isFinite(page) ? page : 0;

    try {
      const { embed, kolPage, kolTotalPages } = formatTokenEmbed(entry.token, {
        kolPage: safePage,
        kolPageSize: 5,
      });

      await interaction.update({
        embeds: [embed],
        components: buildButtons(entry.token, entry.token.meteoraData, { kolPage, kolTotalPages }),
      });
    } catch (error) {
      log("error", `KOL pagination failed: ${error?.stack || error?.message || error}`);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "Gagal update halaman KOL.", ephemeral: true });
      } else {
        await interaction.reply({ content: "Gagal update halaman KOL.", ephemeral: true });
      }
    }
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
