# GMGN Trending Solana Discord Bot

Node.js Discord bot that monitors GMGN.ai trending Solana tokens, applies safety and liquidity filters, and posts the top 5 matches to a Discord channel every 5 minutes.

## Features

- Uses `puppeteer-extra` with the stealth plugin to handle GMGN pages behind Cloudflare.
- Tries the GMGN ranking API first and falls back to browser-session fetching when the API is blocked.
- Monitors both `5m` and `1h` GMGN trending timeframes.
- Filters tokens on mint status, blacklist detection, market cap, 1h volume, total fees, and holder count.
- Deduplicates alerts for 1 hour.
- Supports dry-run mode that prints alerts to the console instead of posting to Discord.
- Retries failed scraping requests up to 3 times with exponential backoff.

## Project Structure

- `src/index.js`: bot entry point, scheduling, Discord integration, dedupe handling
- `src/scraper.js`: API fetch, Cloudflare detection, Puppeteer browser fallback, retry logic
- `src/filters.js`: normalization, merge, filter, ranking logic
- `src/formatter.js`: embed and console formatting helpers
- `src/config.js`: `.env` parsing and validation

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

3. Configure:

- `DISCORD_TOKEN`: Discord bot token
- `DISCORD_CHANNEL_ID`: target channel for alerts
- `CHECK_INTERVAL_MS`: default `300000`
- `MIN_MARKET_CAP`: default `200000`
- `MIN_VOLUME_1H`: default `50000`
- `MIN_TOTAL_FEES_SOL`: default `20`
- `MIN_HOLDERS`: default `500`
- `DRY_RUN`: `true` to print instead of sending Discord embeds

## Usage

Run in dry-run mode:

```bash
node src/index.js --dry-run
```

Run with Discord posting enabled:

```bash
node src/index.js
```

## Notes

- Direct requests to the GMGN API currently return Cloudflare `403` responses from a normal HTTP client, so the bot automatically falls back to Puppeteer when needed.
- The fallback opens the live GMGN trending page at `https://gmgn.ai/trend?chain=sol` to establish a browser session, then calls GMGN’s internal browser API from that session. This is more stable than direct HTML scraping and works around the current Cloudflare block on raw HTTP requests.
- Discord embeds are sent individually for each alert so each token has its own GMGN link and stats card.
