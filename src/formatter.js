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

  const lines = [];
  for (const pool of meteoraData.pools.slice(0, 5)) {
    lines.push(`TVL: **${pool.liquidityFormatted}** · Binstep: **${pool.binStep}** · Fee: **${pool.baseFee}**`);
  }
  return lines.join("\n");
}

function buildButtons(token, meteoraData) {
  const row = new ActionRowBuilder();

  if (meteoraData && meteoraData.totalPools > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("☄️ Meteora")
        .setStyle(ButtonStyle.Link)
        .setURL(meteoraData.pools[0].meteoraUrl)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("☄️ Meteora")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://app.meteora.ag/dlmm?search=${token.address}`)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setLabel("🔍 GMGN")
      .setStyle(ButtonStyle.Link)
      .setURL(token.gmgnUrl || `https://gmgn.ai/sol/token/${token.address}`)
  );

  return row;
}

function formatTokenEmbed(token) {
  const logoUrl = getLogoUrl(token);

  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(`${token.name} (${token.symbol})`)
    .setURL(token.gmgnUrl)
    .setDescription(`CA: \`${token.address}\``)
    .addFields(
      { name: "Market Cap", value: formatCompactNumber(token.marketCap, "$"), inline: true },
      { name: "1h Volume", value: formatCompactNumber(token.volume1h, "$"), inline: true },
      { name: "Fees", value: `${formatCompactNumber(token.totalFeesSol)} SOL`, inline: true },
      { name: "Holders", value: formatCompactNumber(token.holders), inline: true },
      { name: "Safety", value: `Mint: ${token.mintDisabled ? "Disabled" : "Enabled"}\nBlacklist: ${token.hasBlacklist ? "Detected" : "Clear"}`, inline: true },
      { name: "Source", value: token.sourceTimeframes.join(", "), inline: true },
    );

  if (token.meteoraData) {
    embed.addFields({
      name: "Meteora DLMM",
      value: formatMeteoraLines(token.meteoraData),
      inline: false,
    });
  }

  embed.setTimestamp(new Date(token.lastSeenAt));

  if (logoUrl) {
    embed.setThumbnail(logoUrl);
  }

  return embed;
}

function formatConsoleToken(token, index) {
  let output = [
    `${index + 1}. ${token.name} (${token.symbol})`,
    `   CA: ${token.address}`,
    `   Market Cap: ${formatCompactNumber(token.marketCap, "$")}  1h Volume: ${formatCompactNumber(token.volume1h, "$")}  Fees: ${formatCompactNumber(token.totalFeesSol)} SOL`,
    `   Holders: ${formatCompactNumber(token.holders)}  Safety: mint=${token.mintDisabled ? "disabled" : "enabled"}, blacklist=${token.hasBlacklist ? "detected" : "clear"}`,
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
