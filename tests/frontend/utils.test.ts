import { afterEach, describe, expect, it, vi } from "vitest";
import { safeExternalUrl, timeAgo } from "@/lib/utils";

describe("timeAgo", () => {
  afterEach(() => vi.useRealTimers());

  it("formats recent and older timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));

    expect(timeAgo("2026-09-13T11:59:30Z")).toBe("just now");
    expect(timeAgo("2026-09-13T11:15:00Z")).toBe("45m ago");
    expect(timeAgo("2026-09-11T12:00:00Z")).toBe("2d ago");
  });

  it("handles invalid and future timestamps safely", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));

    expect(timeAgo("not-a-date")).toBe("unknown");
    expect(timeAgo("2026-09-14T12:00:00Z")).toBe("just now");
  });
});

describe("safeExternalUrl", () => {
  it("accepts HTTP URLs and rejects executable or credential-bearing URLs", () => {
    expect(safeExternalUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://user:secret@example.com")).toBeNull();
    expect(safeExternalUrl("not a URL")).toBeNull();
  });
});
