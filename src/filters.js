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

  const mintDisabled = inferMintDisabled(rawToken);
  const hasBlacklist = inferHasBlacklist(rawToken);
  const name = rawToken.name || rawToken.tokenName || rawToken.token_name || "Unknown";
  const symbol = rawToken.symbol || rawToken.tokenSymbol || rawToken.token_symbol || "UNKNOWN";

  return {
    name,
    symbol,
    address,
    marketCap,
    volume1h,
    totalFeesSol,
    holders,
    swaps,
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
    sourceTimeframes: [sourceTimeframe],
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
    existing.mintDisabled = existing.mintDisabled || token.mintDisabled;
    existing.hasBlacklist = existing.hasBlacklist || token.hasBlacklist;
    existing.gmgnUrl = existing.gmgnUrl || token.gmgnUrl;
    existing.logoUrl = existing.logoUrl || token.logoUrl;
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
