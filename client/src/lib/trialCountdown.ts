export interface TrialTimeRemaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function getTrialTimeRemaining(trialEndsAt: string | null | undefined): TrialTimeRemaining {
  if (!trialEndsAt) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  const total = end - now;

  if (total <= 0) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((total % (1000 * 60)) / 1000);

  return { total, days, hours, minutes, seconds, expired: false };
}

export function formatTrialCountdown(trialEndsAt: string | null | undefined): string {
  const t = getTrialTimeRemaining(trialEndsAt);
  if (t.expired) return "Trial expired";

  if (t.days > 0) {
    return `${t.days}d ${t.hours}h remaining`;
  }
  if (t.hours > 0) {
    return `${t.hours}h ${t.minutes}m remaining`;
  }
  if (t.minutes > 0) {
    return `${t.minutes}m ${t.seconds}s remaining`;
  }
  return `${t.seconds}s remaining`;
}

export function formatTrialEndsAt(trialEndsAt: string | null | undefined): string {
  if (!trialEndsAt) return "Unknown";
  const date = new Date(trialEndsAt);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function isTrialActive(plan: string, trialEndsAt: string | null | undefined): boolean {
  if (plan !== "trial") return false;
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > Date.now();
}
