const PRICING_URL = "https://switchcontrol.org/pricing";

export function openPricing() {
  const isElectron = typeof window !== 'undefined' && (window as any).electron?.openExternal;
  if (isElectron) {
    (window as any).electron.openExternal(PRICING_URL);
  } else {
    window.open(PRICING_URL, '_blank');
  }
}

export { PRICING_URL };
