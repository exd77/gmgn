# GMGN Trending Solana Discord Bot

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![Chain](https://img.shields.io/badge/Chain-Solana-9945FF)
![Status](https://img.shields.io/badge/Status-Active-22c55e)
![License](https://img.shields.io/badge/License-ISC-blue)

A Discord bot that tracks trending Solana tokens from GMGN, filters out weak stuff, enriches the data, and posts clean alpha alerts to your channel.

No browser scraping. This uses **GMGN OpenAPI** directly.

---

## What this bot does

Every cycle, it will:

1. Pull trending tokens from GMGN (`GMGN_INTERVALS`, default `5m,1h`)
2. Normalize + merge tokens from multiple intervals
3. Apply safety and liquidity filters
4. Rank the best candidates
5. Enrich candidates with:
   - top holder / KOL data
   - Meteora DLMM pool info
6. Send formatted embeds to Discord (or print only in dry-run mode)

---

## Features

- GMGN OpenAPI auth via `X-APIKEY`
- Signed request params (`timestamp`, `client_id`)
- Retry + backoff + 429 handling
- Multi-interval discovery (`GMGN_INTERVALS`)
- Safety checks (mint + blacklist flags)
- Threshold filters (market cap, volume, fees, holders)
- Weighted ranking logic
- KOL holder breakdown + pagination button (`show more`)
- Meteora DLMM enrichment
- Persistent dedupe store (`data/sent-tokens.json`)
- Dry-run mode for safe testing
- Green startup banner via `start.sh`

---

## Project structure

```text
src/
  index.js      # main loop, Discord posting, cache, interaction handling
  config.js     # env loading + validation
  scraper.js    # GMGN client, retries/backoff, KOL endpoint
  filters.js    # normalize/merge/filter/rank logic
  formatter.js  # Discord embed + console formatter
  meteora.js    # Meteora DLMM fetch + formatting
  logger.js     # colored logger
start.sh        # launcher (banner + env loading)
.env.example    # safe env template (no real secrets)
```

---

## Requirements

- Node.js 18+
- npm
- A Discord bot token + channel ID
- GMGN API key

---

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Create your env file

```bash
cp .env.example .env
```

Fill `.env` with your own values.

---

## Environment variables

### Required

- `GMGN_API_KEY`
- `DISCORD_TOKEN` *(required unless `DRY_RUN=true`)*
- `DISCORD_CHANNEL_ID` *(required unless `DRY_RUN=true`)*

### Optional / tuning

- `DISCORD_MENTION_ROLE_ID`
- `CHECK_INTERVAL_MS` (default `300000`)
- `MIN_MARKET_CAP` (default `200000`)
- `MIN_VOLUME_1H` (default `50000`)
- `MIN_TOTAL_FEES_SOL` (default `20`)
- `MIN_HOLDERS` (default `500`)
- `GMGN_API_HOST` (default `https://openapi.gmgn.ai`)
- `GMGN_CHAIN` (default `sol`)
- `GMGN_RANK_LIMIT` (default `100`)
- `GMGN_INTERVALS` (default `5m,1h`)
- `GMGN_REQUEST_TIMEOUT_MS` (default `15000`)
- `GMGN_RETRY_ATTEMPTS` (default `3`)
- `GMGN_KOL_HOLDERS_LIMIT` (default `30`)
- `DRY_RUN` (`true`/`false`)

---

## Run

### Dry run (no Discord post)

```bash
npm run dry-run
# or
node src/index.js --dry-run
```

### Live mode

```bash
npm start
# or
./start.sh
```

---

## Validation

Quick syntax check:

```bash
npm run check
```

---

## Runtime notes

- In-memory dedupe window: `alertDedupMs = 1h`
- Persistent sent tokens file: `data/sent-tokens.json`
- Embed fields include:
  - `CA`, `Age`, `Social`
  - market + holder + safety metrics
  - KOL summary
  - Meteora pool lines
- Buttons:
  - `☄️ Meteora`
  - `🐸 GMGN`
  - `➡️ show more` (KOL pagination)

---

## Security notes

This repo is configured to avoid leaking secrets:

- `.env` and `.env.*` are ignored
- `.env.example` is placeholder-only
- runtime/session artifacts are ignored (`data/sent-tokens.json`, cookie files)

**Never commit real API keys or Discord tokens.**

---

## Troubleshooting

### GMGN returns `401/403`

- check `GMGN_API_KEY`
- verify host is `https://openapi.gmgn.ai`
- check timeout/retry values

### Discord login/send fails

- check `DISCORD_TOKEN`
- make sure the bot is in your server
- make sure it has send message + embed permissions

### Nothing passes filters

- lower thresholds: `MIN_MARKET_CAP`, `MIN_VOLUME_1H`, `MIN_TOTAL_FEES_SOL`, `MIN_HOLDERS`
- adjust `GMGN_INTERVALS`
- confirm chain via `GMGN_CHAIN`

---

## Disclaimer

This bot is for monitoring/signals only.

**Not financial advice. Always DYOR.**
