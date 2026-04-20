const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function formatCompactNumber(value, prefix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000) {
    return `${prefix}${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (absValue >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (absValue >= 1_000) {
    return `${prefix}${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${prefix}${Math.round(value)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1).replace(/\.0$/, "")}%`;
}

function toPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

function formatAgeCompactFromMs(createdAtMs) {
  const ms = Number(createdAtMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "N/A";

  const elapsedMs = Date.now() - ms;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "N/A";

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsedMs >= day) {
    return `${Math.floor(elapsedMs / day)}d`;
  }
  if (elapsedMs >= hour) {
    return `${Math.floor(elapsedMs / hour)}h`;
  }
  if (elapsedMs >= minute) {
    return `${Math.floor(elapsedMs / minute)}m`;
  }

  return `${Math.max(1, Math.floor(elapsedMs / 1000))}s`;
}

function isValidXUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com")
    );
  } catch {
    return false;
  }
}

function barFromPercent(percent, width = 10) {
  if (percent === null || percent === undefined || Number.isNaN(percent)) {
    return "░".repeat(width);
  }
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function fmtCell(label, pct, lw, bw) {
  const lab = String(label).slice(0, lw).padEnd(lw);
  const bar = barFromPercent(pct, bw);
  const ptxt = pct === null
    ? " N/A"
    : `${Math.min(100, pct).toFixed(1).padStart(4)}%`;
  return `${lab} ${bar} ${ptxt}`;
}

function formatHolderKolStatsCodeBlock(token) {
  const s = token.holderStats || {};
  const holders = Number(token.holders || 0);
  const share = (count) => {
    const n = Number(count || 0);
    if (!holders || !Number.isFinite(n)) return null;
    return (n / holders) * 100;
  };

  const lw = 7;
  const bw = 6;
  const rows = [
    ["KOL", share(s.renownedCount), "Insider", toPercent(s.insiderRate)],
    ["Smart", share(s.smartDegenCount), "Top10", toPercent(s.top10Rate)],
    ["Sniper", share(s.sniperCount), "Bundler", toPercent(s.bundlerRate)],
    ["Fresh", share(s.freshWalletCount), "Bot", toPercent(s.botDegenRate)],
  ];

  const lines = rows.map(([lL, lP, rL, rP]) =>
    `${fmtCell(lL, lP, lw, bw)} | ${fmtCell(rL, rP, lw, bw)}`
  );

  return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

function formatKolList(kolHolders, { page = 0, pageSize = 5 } = {}) {
  if (!Array.isArray(kolHolders) || kolHolders.length === 0) {
    return { text: null, totalPages: 0, page: 0 };
  }

  const totalPages = Math.max(1, Math.ceil(kolHolders.length / pageSize));
  const safePage = Math.max(0, Math.min(totalPages - 1, page));
  const start = safePage * pageSize;
  const end = Math.min(kolHolders.length, start + pageSize);

  const lines = [];

  for (let i = start; i < end; i += 1) {
    const kol = kolHolders[i];
    const safeNameRaw = kol.name || `${kol.address.slice(0, 6)}...${kol.address.slice(-4)}`;
    const safeName = String(safeNameRaw).replace(/\]/g, "");
    const profileUrl = `https://gmgn.ai/sol/address/${kol.address}`;
    const initBuy = formatCompactNumber(kol.initBuyUsd, "$");
    const remaining = formatCompactNumber(kol.remainingUsd || kol.remainingTokens, kol.remainingUsd ? "$" : "");
    const line = `${i + 1}. [${safeName}](${profileUrl}) · Buy: **${initBuy}** · Hold: **${remaining}**`;
    lines.push(line);
  }

  return {
    text: lines.length ? lines.join("\n") : null,
    totalPages,
    page: safePage,
  };
}

function getLogoUrl(token) {
  if (token.logoUrl) return token.logoUrl;
  if (token.address) {
    return `https://dd.dexscreener.com/ds-data/tokens/solana/${token.address}.png`;
  }
  return null;
}

function formatMeteoraLines(meteoraData) {
  if (!meteoraData || meteoraData.totalPools === 0) {
    return "No DLMM pools found";
  }

  // Natural single-block format:
  // <pair> <binstep> 💧 <TVL> 💰 <24h fees>
  const lines = [];
  let used = 0;

  for (const pool of meteoraData.pools) {
    const pair = pool.name || "unknown-pair";
    const bin = `${pool.binStep}/${pool.baseFee}`;
    const tvl = pool.liquidityFormatted || formatCompactNumber(pool.liquidity, "$");
    const fees24h = pool.fees24hFormatted || formatCompactNumber(pool.fees24h, "$");
    const line = `[${pair} ${bin}](${pool.meteoraUrl || "https://app.meteora.ag/dlmm"}) 💧 \`${tvl}\` 💰 \`${fees24h}\``;

    // Keep one natural field block, fit Discord field limit safely.
    if (used + line.length + 1 > 980) break;

    lines.push(line);
    used += line.length + 1;
  }

  return lines.length ? lines.join("\n") : "No DLMM pools found";
}

function buildButtons(token, meteoraData, { kolPage = 0, kolTotalPages = 1 } = {}) {
  const rows = [];
  const linksRow = new ActionRowBuilder();

  if (meteoraData && meteoraData.totalPools > 0) {
    linksRow.addComponents(
      new ButtonBuilder()
        .setLabel("☄️ Meteora")
        .setStyle(ButtonStyle.Link)
        .setURL(meteoraData.pools[0].meteoraUrl)
    );
  } else {
    linksRow.addComponents(
      new ButtonBuilder()
        .setLabel("☄️ Meteora")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://app.meteora.ag/dlmm?search=${token.address}`)
    );
  }

  linksRow.addComponents(
    new ButtonBuilder()
      .setLabel("🐸 GMGN")
      .setStyle(ButtonStyle.Link)
      .setURL(token.gmgnUrl || `https://gmgn.ai/sol/token/${token.address}`)
  );

  rows.push(linksRow);

  if (kolTotalPages > 1) {
    const nextPage = (kolPage + 1) % kolTotalPages;
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`kol:${token.address}:${nextPage}`)
        .setLabel(kolPage < kolTotalPages - 1 ? "➡️ show more" : "⬅ back to top")
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(navRow);
  }

  return rows;
}

function isValidHttpUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function safeFieldValue(value, fallback = "N/A") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.slice(0, 1024);
}

function formatTokenEmbed(token, { kolPage = 0, kolPageSize = 5 } = {}) {
  const logoUrl = getLogoUrl(token);
  const title = `${token.name || "Unknown"} (${token.symbol || "UNKNOWN"})`.slice(0, 256);
  const sourceText = Array.isArray(token.sourceTimeframes)
    ? token.sourceTimeframes.filter(Boolean).join(", ")
    : "";

  const tokenAge = formatAgeCompactFromMs(token.createdAtMs);
  const socialLine = isValidXUrl(token.socialUrl)
    ? token.socialUrl
    : "N/A";

  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(title)
    .setDescription(
      `**CA**     : \`${token.address}\`\n` +
      `**Age**    : \`${tokenAge}\`\n` +
      `**Social** : ${socialLine}`
    )
    .addFields(
      { name: "Market Cap", value: safeFieldValue(formatCompactNumber(token.marketCap, "$")), inline: true },
      { name: "1h Volume", value: safeFieldValue(formatCompactNumber(token.volume1h, "$")), inline: true },
      { name: "Fees", value: safeFieldValue(`${formatCompactNumber(token.totalFeesSol)} SOL`), inline: true },
      { name: "Holders", value: safeFieldValue(formatCompactNumber(token.holders)), inline: true },
      { name: "Safety", value: safeFieldValue(`Mint: ${token.mintDisabled ? "Disabled" : "Enabled"}\nBlacklist: ${token.hasBlacklist ? "Detected" : "Clear"}`), inline: true },
      { name: "Source", value: safeFieldValue(sourceText), inline: true },
      { name: "\u200b", value: safeFieldValue(formatHolderKolStatsCodeBlock(token), "```\nN/A\n```"), inline: false },
    );

  if (isValidHttpUrl(token.gmgnUrl)) {
    embed.setURL(token.gmgnUrl);
  }

  const { text: kolList, totalPages, page } = formatKolList(token.kolHolders, {
    page: kolPage,
    pageSize: kolPageSize,
  });
  if (kolList) {
    const kolCount = token.kolHolders?.length || 0;
    const hasMore = totalPages > 1;
    embed.addFields({
      name: `KOL (${kolCount}):`,
      value: kolList,
      inline: false,
    });

    if (hasMore) {
      embed.setFooter({ text: `Page ${page + 1}/${totalPages}` });
    }
  }

  if (token.meteoraData) {
    embed.addFields({
      name: "Meteora DLMM:",
      value: formatMeteoraLines(token.meteoraData),
      inline: false,
    });
  }

  embed.setTimestamp(new Date(token.lastSeenAt));

  if (logoUrl) {
    embed.setThumbnail(logoUrl);
  }

  return { embed, kolPage: page, kolTotalPages: totalPages };
}

function formatConsoleToken(token, index) {
  const tokenAge = formatAgeCompactFromMs(token.createdAtMs);
  const socialLine = isValidXUrl(token.socialUrl) ? token.socialUrl : "N/A";

  let output = [
    `${index + 1}. ${token.name} (${token.symbol})`,
    `   **CA**    : ${token.address}`,
    `   **Age**   : ${tokenAge}`,
    `   **Social**: ${socialLine}`,
    `   Market Cap: ${formatCompactNumber(token.marketCap, "$")}  1h Volume: ${formatCompactNumber(token.volume1h, "$")}  Fees: ${formatCompactNumber(token.totalFeesSol)} SOL`,
    `   Holders: ${formatCompactNumber(token.holders)}  Safety: mint=${token.mintDisabled ? "disabled" : "enabled"}, blacklist=${token.hasBlacklist ? "detected" : "clear"}`,
    `   Holder/KOL Stats: KOL=${formatCompactNumber(token.holderStats?.renownedCount)} Smart=${formatCompactNumber(token.holderStats?.smartDegenCount)} Top10=${formatPercent(token.holderStats?.top10Rate)} Insider=${formatPercent(token.holderStats?.insiderRate)} Bundler=${formatPercent(token.holderStats?.bundlerRate)} Bot=${formatPercent(token.holderStats?.botDegenRate)}`,
    `   Source: ${token.sourceTimeframes.join(", ")}`,
    `   GMGN: ${token.gmgnUrl}`,
  ];

  if (token.meteoraData && token.meteoraData.totalPools > 0) {
    output.push(`   Meteora Pools:`);
    for (const pool of token.meteoraData.pools.slice(0, 5)) {
      output.push(`     TVL: ${pool.liquidityFormatted}  BinStep: ${pool.binStep}  Fee: ${pool.baseFee}`);
    }
  }

  return output.join("\n");
}

module.exports = {
  buildButtons,
  formatCompactNumber,
  formatConsoleToken,
  formatTokenEmbed,
};
