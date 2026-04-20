const METEORA_GROUPS_API = "https://dlmm.datapi.meteora.ag/pools/groups";
const { log } = require("./logger");

function formatUsd(val) {
  const num = parseFloat(val);
  if (isNaN(num) || num === 0) return "$0.00";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

async function fetchMeteoraPools(mint) {
  try {
    const groupsUrl = `${METEORA_GROUPS_API}?query=${mint}&page=1&page_size=10&sort_by=tvl:desc&filter_by=is_blacklisted:=false`;

    const groupsResp = await fetch(groupsUrl, {
      headers: {
        Accept: "application/json",
        Origin: "https://app.meteora.ag",
        Referer: "https://app.meteora.ag/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!groupsResp.ok) {
      log("warn", `[Meteora] HTTP ${groupsResp.status} for ${mint.slice(0, 10)}...`);
      return null;
    }

    const groupsJson = await groupsResp.json();
    const groups = groupsJson?.data || [];

    if (groups.length === 0) {
      log("info", `[Meteora] No DLMM pools for ${mint.slice(0, 10)}...`);
      return null;
    }

    const pools = [];

    for (const group of groups) {
      const groupId = group.lexical_order_mints;
      if (!groupId) continue;

      try {
        const detailUrl = `${METEORA_GROUPS_API}/${groupId}`;
        const detailResp = await fetch(detailUrl, {
          headers: {
            Accept: "application/json",
            Origin: "https://app.meteora.ag",
            Referer: "https://app.meteora.ag/",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!detailResp.ok) continue;

        const detailJson = await detailResp.json();
        const pairData = detailJson?.data || [];

        for (const pair of pairData) {
          pools.push({
            address: pair.address,
            name: pair.name,
            binStep: pair.pool_config?.bin_step || 0,
            baseFee: pair.pool_config?.base_fee_pct || 0,
            liquidity: parseFloat(pair.tvl || 0),
            liquidityFormatted: formatUsd(pair.tvl),
            volume24h: pair.volume?.["24h"] || 0,
            volume24hFormatted: formatUsd(pair.volume?.["24h"]),
            fees24h: pair.fees?.["24h"] || 0,
            fees24hFormatted: formatUsd(pair.fees?.["24h"]),
            apr: pair.apr || 0,
            meteoraUrl: `https://app.meteora.ag/dlmm/${pair.address}`,
          });
        }
      } catch (detailErr) {
        log("warn", `[Meteora] Detail error: ${detailErr.message}`);
      }
    }

    pools.sort((a, b) => b.liquidity - a.liquidity);
    log("info", `[Meteora] Found ${pools.length} pool(s) for ${mint.slice(0, 10)}...`);

    return { pools, totalPools: pools.length };
  } catch (e) {
    log("warn", `[Meteora] Error: ${e.message}`);
    return null;
  }
}

module.exports = {
  fetchMeteoraPools,
};
