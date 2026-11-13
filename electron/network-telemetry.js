const MAX_NETWORK_SAMPLE_AGE_MS = 15_000;
const VIRTUAL_INTERFACE = /loopback|tun|vpn|veth|docker|vmware|hyper-v/i;

function isValidRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) =>
    row &&
    (isValidRate(row.rx_sec) || isValidRate(row.tx_sec))
  );
}

function resolveNetworkStatsSample(candidate, cached, cachedAt, now) {
  const currentRows = validRows(candidate);
  if (currentRows.length > 0) {
    return { stats: currentRows, sampledAt: now, available: true, refreshed: true };
  }

  const cachedRows = validRows(cached);
  if (
    cachedRows.length > 0 &&
    Number.isFinite(cachedAt) &&
    now >= cachedAt &&
    now - cachedAt <= MAX_NETWORK_SAMPLE_AGE_MS
  ) {
    return { stats: cachedRows, sampledAt: cachedAt, available: true, refreshed: false };
  }

  return { stats: [], sampledAt: null, available: false, refreshed: false };
}

function summarizeNetworkStats(stats) {
  const rows = validRows(stats);
  const physicalCandidates = rows.filter((row) => !VIRTUAL_INTERFACE.test(String(row.iface || "")));
  const candidates = physicalCandidates.length > 0 ? physicalCandidates : rows;
  const primary = candidates.reduce((best, row) => {
    if (!best) return row;
    const rowTraffic = (isValidRate(row.rx_sec) ? row.rx_sec : 0) + (isValidRate(row.tx_sec) ? row.tx_sec : 0);
    const bestTraffic = (isValidRate(best.rx_sec) ? best.rx_sec : 0) + (isValidRate(best.tx_sec) ? best.tx_sec : 0);
    return rowTraffic > bestTraffic ? row : best;
  }, null);

  return {
    available: Boolean(primary),
    rxKBps: primary && isValidRate(primary.rx_sec) ? primary.rx_sec / 1024 : 0,
    txKBps: primary && isValidRate(primary.tx_sec) ? primary.tx_sec / 1024 : 0,
    interfaceName: primary
      ? String(primary.iface || primary.ifaceName || primary.name || "").trim() || null
      : null,
  };
}

module.exports = { resolveNetworkStatsSample, summarizeNetworkStats };
