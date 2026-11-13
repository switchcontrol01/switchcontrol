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

function parseNetworkCounterRows(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (_error) {
      return [];
    }
  }

  const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  return rows.map((row) => {
    const iface = String(row?.iface ?? row?.Name ?? row?.name ?? "").trim();
    const rxRaw = row?.rx_bytes ?? row?.ReceivedBytes ?? row?.receivedBytes;
    const txRaw = row?.tx_bytes ?? row?.SentBytes ?? row?.sentBytes;
    const rxBytes = Number(rxRaw);
    const txBytes = Number(txRaw);
    if (!iface || rxRaw == null || txRaw == null ||
        !Number.isFinite(rxBytes) || rxBytes < 0 ||
        !Number.isFinite(txBytes) || txBytes < 0) {
      return null;
    }
    return { iface, rx_bytes: rxBytes, tx_bytes: txBytes };
  }).filter(Boolean);
}

function resolveNetworkCounterSample(candidate, cachedCounters, cachedAt, now) {
  const counters = parseNetworkCounterRows(candidate);
  if (counters.length === 0) {
    return { stats: [], counters: [], sampledAt: null, available: false, refreshed: false };
  }

  const elapsedMs = Number.isFinite(cachedAt) ? now - cachedAt : 0;
  const canCalculateRate =
    Array.isArray(cachedCounters) &&
    elapsedMs > 0 &&
    elapsedMs <= MAX_NETWORK_SAMPLE_AGE_MS;
  const previousByInterface = new Map(
    parseNetworkCounterRows(cachedCounters).map((row) => [row.iface.toLowerCase(), row]),
  );
  const elapsedSeconds = canCalculateRate ? elapsedMs / 1000 : 0;
  const stats = counters.map((row) => {
    const previous = previousByInterface.get(row.iface.toLowerCase());
    const hasBaseline = canCalculateRate && previous;
    const rxDelta = hasBaseline ? Math.max(0, row.rx_bytes - previous.rx_bytes) : 0;
    const txDelta = hasBaseline ? Math.max(0, row.tx_bytes - previous.tx_bytes) : 0;
    return {
      iface: row.iface,
      rx_sec: elapsedSeconds > 0 ? rxDelta / elapsedSeconds : 0,
      tx_sec: elapsedSeconds > 0 ? txDelta / elapsedSeconds : 0,
    };
  });

  return { stats, counters, sampledAt: now, available: true, refreshed: true };
}

module.exports = {
  resolveNetworkStatsSample,
  summarizeNetworkStats,
  parseNetworkCounterRows,
  resolveNetworkCounterSample,
};
