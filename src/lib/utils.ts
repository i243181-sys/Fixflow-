import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(iso: string): string {
  const date = new Date(iso);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const diff = Math.max(Date.now() - timestamp, 0);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const usesHttp = url.protocol === "http:" || url.protocol === "https:";
    return usesHttp && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
