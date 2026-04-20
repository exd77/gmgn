const NO_COLOR = /^1|true|yes|on$/i.test(String(process.env.NO_COLOR || ""));

const PALETTE = {
  info: 82,   // bright GMGN green
  warn: 76,   // softer green-yellow
  error: 40,  // dark green
  debug: 64,  // mid green
  time: 35,   // dim green for timestamp
  bracket: 29,
  reset: "\x1b[0m",
};

function supportsColor() {
  if (NO_COLOR) return false;
  if (String(process.env.FORCE_COLOR || "") === "0") return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

function color(code, text) {
  return `\x1b[1;38;5;${code}m${text}${PALETTE.reset}`;
}

function buildPrefix(level) {
  const upper = String(level || "info").toUpperCase();
  const ts = new Date().toISOString();

  if (!supportsColor()) {
    return `[${ts}] [${upper}]`;
  }

  const levelColor = PALETTE[String(level || "info").toLowerCase()] || PALETTE.info;
  return `${color(PALETTE.bracket, "[")}${color(PALETTE.time, ts)}${color(PALETTE.bracket, "]")} ${color(PALETTE.bracket, "[")}${color(levelColor, upper)}${color(PALETTE.bracket, "]")}`;
}

function log(level, message, meta) {
  const prefix = buildPrefix(level);
  if (meta === undefined) {
    console.log(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`, meta);
}

module.exports = {
  log,
};
