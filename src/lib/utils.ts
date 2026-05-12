import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validates that a cover URL is safe to store and render:
 * must be absolute HTTPS to prevent mixed-content and protocol-injection attacks.
 * Returns true for empty/null (no cover is valid).
 */
export function isValidCoverUrl(url: string): boolean {
  if (!url.trim()) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
