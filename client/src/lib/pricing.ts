const PRICING_URL = "https://switchcontrol.org/pricing";

export function openPricing() {
  const api = (window as any).electronAPI;
  if (api?.openExternal) {
    api.openExternal(PRICING_URL);
  } else {
    window.open(PRICING_URL, '_blank');
  }
}

export { PRICING_URL };
