#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# 256-color green palette (screen/tmux-safe)
G0=46   # neon green
G1=82
G2=76
G3=70
G4=64
G5=40
G_DIM=35
G_LINE=29

cprint() {
  local color="$1"
  shift
  printf '\e[1;38;5;%sm%s\e[0m\n' "$color" "$*"
}

print_gmgn_banner() {
  local -a lines=(
" ██████╗ ███╗   ███╗  ██████╗ ███╗   ██╗"
"██╔════╝ ████╗ ████║ ██╔════╝ ████╗  ██║"
"██║  ███╗██╔████╔██║ ██║  ███╗██╔██╗ ██║"
"██║   ██║██║╚██╔╝██║ ██║   ██║██║╚██╗██║"
"╚██████╔╝██║ ╚═╝ ██║ ╚██████╔╝██║ ╚████║"
" ╚═════╝ ╚═╝     ╚═╝  ╚═════╝ ╚═╝  ╚═══╝"
  )

  local -a colors=($G0 $G1 $G2 $G3 $G4 $G5 $G_DIM)

  local i
  for i in "${!lines[@]}"; do
    printf '\e[1;38;5;%sm%s\e[0m\n' "${colors[$i]}" "${lines[$i]}"
  done
  printf '\n'
}

print_summary() {
  local mode="LIVE"
  if [[ "${DRY_RUN:-}" =~ ^([Tt][Rr][Uu][Ee]|1|yes|on)$ ]]; then
    mode="DRY-RUN"
  fi

  local -a lines=(
"🐸 GMGN bot starting..."
"📁 Directory       : $APP_DIR"
"🧭 Runtime         : Node $(node -v 2>/dev/null || echo N/A)"
"📦 Package manager : npm $(npm -v 2>/dev/null || echo N/A)"
"🎯 Mode            : ${mode}"
"⏱️  Check interval  : ${CHECK_INTERVAL_MS:-30000} ms"
"📊 Filters         : MC>=${MIN_MARKET_CAP:-200000} | Vol1h>=${MIN_VOLUME_1H:-50000} | Fees>=${MIN_TOTAL_FEES_SOL:-20} SOL | Holders>=${MIN_HOLDERS:-500}"
"🛰️  Intervals       : ${GMGN_INTERVALS:-5m,1h}"
"📣 Discord channel : ${DISCORD_CHANNEL_ID:-<unset>}"
"────────────────────────────────────────────────────────────"
  )

  local -a colors=($G0 $G1 $G2 $G3 $G4 $G5 $G_DIM $G_DIM $G_DIM $G_LINE)

  local i
  for i in "${!lines[@]}"; do
    printf '\e[1;38;5;%sm%s\e[0m\n' "${colors[$i]}" "${lines[$i]}"
  done
  printf '\n'
}

# Load env from local project first
if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env
  set +a
fi

# Optional extra env path (same convention as other bots)
if [[ -f "$HOME/.config/gmgn/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.config/gmgn/.env"
  set +a
fi

print_gmgn_banner
print_summary

export NODE_NO_WARNINGS=1
export FORCE_COLOR=1

exec npm start
