import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeFixed(value: unknown, digits = 1, fallback = "0"): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}
