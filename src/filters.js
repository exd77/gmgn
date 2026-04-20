function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[$,%\s,]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function toTimestampMs(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Heuristic: < 1e12 is likely unix seconds, otherwise milliseconds.
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber);
    }

    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstTimestampMs(...values) {
  for (const value of values) {
    const parsed = toTimestampMs(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function normalizeXProfileUrl(...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const value = candidate.trim();
    if (!value) continue;

    // Full URL provided.
    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        if (host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com") {
          const username = parsed.pathname.replace(/^\/+/, "").split("/")[0];
          if (username && username !== "home" && username !== "i") {
            return `https://x.com/${username.replace(/^@+/, "")}`;
          }
        }
      } catch {
        // ignore malformed URL and continue fallback parsing.
      }
    }

    // Username provided.
    const username = value.replace(/^@+/, "").trim();
    if (/^[A-Za-z0-9_]{1,15}$/.test(username)) {
      return `https://x.com/${username}`;
    }
  }

  return "";
}

function inferMintDisabled(token) {
  const candidates = [
    token.isMintDisabled,
    token.is_mint_disabled,
    token.mintDisabled,
    token.mint_disabled,
    token.mintAuthorityDisabled,
    token.mint_authority_disabled,
    token.renouncedMint,
    token.renounced_mint,
    token.isRenounced,
    token.is_renounced,
  ];

  for (const value of candidates) {
    if (typeof value === "boolean") {
      return value;
    }
    if (value === 1 || value === "1" || value === "true") {
      return true;
    }
    if (value === 0 || value === "0" || value === "false") {
      return false;
    }
  }

  const mintAuthorityCandidates = [token.mintAuthority, token.mint_authority];
  for (const value of mintAuthorityCandidates) {
    if (value === null || value === "" || value === "0x0") {
      return true;
    }
  }

  return false;
}

function inferHasBlacklist(token) {
  const candidates = [
    token.hasBlacklist,
    token.has_blacklist,
    token.blacklistDetected,
    token.blacklist_detected,
    token.isBlacklistEnabled,
    token.is_blacklist_enabled,
  ];

  for (const value of candidates) {
    if (typeof value === "boolean") {
      return value;
    }
    if (value === 1 || value === "1" || value === "true") {
      return true;
    }
    if (value === 0 || value === "0" || value === "false") {
      return false;
    }
  }

  const textBlob = [
    token.securityText,
    token.security_text,
    token.riskSummary,
    token.risk_summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (textBlob.includes("blacklist")) {
    return !textBlob.includes("no blacklist");
  }

  const freezeAuthorityCandidates = [
    token.renouncedFreezeAccount,
    token.renounced_freeze_account,
    token.freezeAuthorityDisabled,
    token.freeze_authority_disabled,
  ];
  for (const value of freezeAuthorityCandidates) {
    if (value === 1 || value === "1" || value === true || value === "true") {
      return false;
    }
    if (value === 0 || value === "0" || value === false || value === "false") {
      return true;
    }
  }

  return false;
}

function normalizeToken(rawToken, sourceTimeframe) {
  const address =
    rawToken.address ||
    rawToken.ca ||
    rawToken.contractAddress ||
    rawToken.contract_address ||
    rawToken.tokenAddress ||
    rawToken.token_address ||
    rawToken.mint ||
    rawToken.base_mint ||
    rawToken.baseMint ||
    "";

  const marketCap = firstNumber(
    rawToken.marketCap,
    rawToken.market_cap,
    rawToken.fdv,
    rawToken.fdv_usd
  );

  const volume1h = firstNumber(
    rawToken.volume1h,
    rawToken.volume_1h,
    rawToken.volume,
    rawToken.volumeUsd1h,
    rawToken.volume_usd_1h,
    rawToken.volume_5m,
    rawToken.volume5m,
    rawToken.swaps_amount,
    rawToken.swapsAmount,
    rawToken.total_volume,
    rawToken.totalVolume
  );

  const totalFeesSol = firstNumber(
    rawToken.totalFeesSol,
    rawToken.total_fees_sol,
    rawToken.totalFee,
    rawToken.total_fee,
    rawToken.feesSol,
    rawToken.fees_sol,
    rawToken.gasFee,
    rawToken.gas_fee
  );

  const holders = firstNumber(rawToken.holders, rawToken.holderCount, rawToken.holder_count);
  const swaps = firstNumber(rawToken.swaps, rawToken.swapCount, rawToken.swap_count) || 0;

  const holderStats = {
    top10Rate: firstNumber(rawToken.top_10_holder_rate, rawToken.top10_holder_rate, rawToken.topHolderRate),
    mcPerHolder: firstNumber(rawToken.mc_holder, rawToken.mc_per_holder, rawToken.mcPerHolder),
    renownedCount: firstNumber(rawToken.renowned_count, rawToken.kol_count, rawToken.kolCount),
    smartDegenCount: firstNumber(rawToken.smart_degen_count, rawToken.smart_count, rawToken.smartCount),
    insiderRate: firstNumber(rawToken.insider_rate, rawToken.insider_ratio),
    phishingRate: firstNumber(rawToken.phishing_rate, rawToken.phishing_ratio),
    bundlerRate: firstNumber(rawToken.bundler_rate, rawToken.bundle_rate),
    botDegenRate: firstNumber(rawToken.bot_degen_rate, rawToken.bot_ratio),
    sniperCount: firstNumber(rawToken.sniper_count, rawToken.snipers),
    freshWalletCount: firstNumber(rawToken.fresh_wallet_count, rawToken.fresh_count),
  };

  const mintDisabled = inferMintDisabled(rawToken);
  const hasBlacklist = inferHasBlacklist(rawToken);
  const name = rawToken.name || rawToken.tokenName || rawToken.token_name || "Unknown";
  const symbol = rawToken.symbol || rawToken.tokenSymbol || rawToken.token_symbol || "UNKNOWN";

  const createdAtMs = firstTimestampMs(
    rawToken.creation_timestamp,
    rawToken.created_timestamp,
    rawToken.created_at,
    rawToken.open_timestamp,
    rawToken.start_live_timestamp,
    rawToken.pool_created_timestamp,
    rawToken.pool_created_at,
    rawToken.launch_timestamp,
    rawToken.launch_time,
    rawToken.first_trade_timestamp,
    rawToken.first_trade_time,
    rawToken.mint_timestamp,
    rawToken.mint_time,
    rawToken.time
  );

  const socialUrl = normalizeXProfileUrl(
    rawToken.twitter,
    rawToken.twitter_url,
    rawToken.twitterUrl,
    rawToken.twitter_username,
    rawToken.twitterUsername,
    rawToken.x,
    rawToken.x_url,
    rawToken.xUrl
  );

  return {
    name,
    symbol,
    address,
    marketCap,
    volume1h,
    totalFeesSol,
    holders,
    swaps,
    holderStats,
    mintDisabled,
    hasBlacklist,
    logoUrl:
      rawToken.logoUrl ||
      rawToken.logo_url ||
      rawToken.logo ||
      rawToken.image ||
      rawToken.imageUrl ||
      rawToken.image_url ||
      rawToken.icon ||
      rawToken.tokenLogo ||
      rawToken.token_logo ||
      "",
    gmgnUrl: rawToken.gmgnUrl || rawToken.link || "",
    socialUrl,
    sourceTimeframes: [sourceTimeframe],
    createdAtMs,
    createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : null,
    lastSeenAt: new Date().toISOString(),
    raw: rawToken,
  };
}

function mergeTokens(tokens) {
  const byAddress = new Map();

  for (const token of tokens) {
    if (!token.address) {
      continue;
    }

    const existing = byAddress.get(token.address);
    if (!existing) {
      byAddress.set(token.address, { ...token });
      continue;
    }

    existing.sourceTimeframes = [...new Set([...existing.sourceTimeframes, ...token.sourceTimeframes])];
    existing.marketCap = Math.max(existing.marketCap || 0, token.marketCap || 0) || existing.marketCap || token.marketCap;
    existing.volume1h = Math.max(existing.volume1h || 0, token.volume1h || 0) || existing.volume1h || token.volume1h;
    existing.totalFeesSol =
      Math.max(existing.totalFeesSol || 0, token.totalFeesSol || 0) ||
      existing.totalFeesSol ||
      token.totalFeesSol;
    existing.holders = Math.max(existing.holders || 0, token.holders || 0) || existing.holders || token.holders;
    existing.swaps = Math.max(existing.swaps || 0, token.swaps || 0);

    existing.holderStats = {
      top10Rate: Math.max(existing.holderStats?.top10Rate || 0, token.holderStats?.top10Rate || 0) || null,
      mcPerHolder: Math.max(existing.holderStats?.mcPerHolder || 0, token.holderStats?.mcPerHolder || 0) || null,
      renownedCount: Math.max(existing.holderStats?.renownedCount || 0, token.holderStats?.renownedCount || 0) || null,
      smartDegenCount: Math.max(existing.holderStats?.smartDegenCount || 0, token.holderStats?.smartDegenCount || 0) || null,
      insiderRate: Math.max(existing.holderStats?.insiderRate || 0, token.holderStats?.insiderRate || 0) || null,
      phishingRate: Math.max(existing.holderStats?.phishingRate || 0, token.holderStats?.phishingRate || 0) || null,
      bundlerRate: Math.max(existing.holderStats?.bundlerRate || 0, token.holderStats?.bundlerRate || 0) || null,
      botDegenRate: Math.max(existing.holderStats?.botDegenRate || 0, token.holderStats?.botDegenRate || 0) || null,
      sniperCount: Math.max(existing.holderStats?.sniperCount || 0, token.holderStats?.sniperCount || 0) || null,
      freshWalletCount: Math.max(existing.holderStats?.freshWalletCount || 0, token.holderStats?.freshWalletCount || 0) || null,
    };

    existing.mintDisabled = existing.mintDisabled || token.mintDisabled;
    existing.hasBlacklist = existing.hasBlacklist || token.hasBlacklist;
    existing.gmgnUrl = existing.gmgnUrl || token.gmgnUrl;
    existing.logoUrl = existing.logoUrl || token.logoUrl;
    existing.socialUrl = existing.socialUrl || token.socialUrl;

    const existingCreatedAtMs = Number(existing.createdAtMs || 0);
    const incomingCreatedAtMs = Number(token.createdAtMs || 0);
    if (!existingCreatedAtMs || (incomingCreatedAtMs && incomingCreatedAtMs < existingCreatedAtMs)) {
      existing.createdAtMs = incomingCreatedAtMs || existingCreatedAtMs || null;
      existing.createdAt = existing.createdAtMs ? new Date(existing.createdAtMs).toISOString() : null;
    }

    existing.raw = { ...existing.raw, ...token.raw };
  }

  return [...byAddress.values()];
}

function filterTokens(tokens, config) {
  return tokens.filter((token) => {
    return (
      token.address &&
      token.mintDisabled &&
      !token.hasBlacklist &&
      (token.marketCap || 0) >= config.minMarketCap &&
      (token.volume1h || 0) >= config.minVolume1h &&
      (token.totalFeesSol || 0) >= config.minTotalFeesSol &&
      (token.holders || 0) >= config.minHolders
    );
  });
}

function rankTokens(tokens) {
  return [...tokens]
    .sort((left, right) => {
      const scoreLeft =
        (left.volume1h || 0) * 0.45 +
        (left.marketCap || 0) * 0.2 +
        (left.totalFeesSol || 0) * 2000 +
        (left.holders || 0) * 100 +
        (left.swaps || 0) * 10;
      const scoreRight =
        (right.volume1h || 0) * 0.45 +
        (right.marketCap || 0) * 0.2 +
        (right.totalFeesSol || 0) * 2000 +
        (right.holders || 0) * 100 +
        (right.swaps || 0) * 10;
      return scoreRight - scoreLeft;
    })
    .slice(0, 5);
}

module.exports = {
  filterTokens,
  mergeTokens,
  normalizeToken,
  rankTokens,
};
