import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/time";

const ago = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString();

describe("timeAgo", () => {
  it("uses 'just now' under a minute", () => {
    expect(timeAgo(ago(10))).toBe("just now");
  });

  it("scales through m / h / d / mo / y", () => {
    expect(timeAgo(ago(5 * 60))).toBe("5m ago");
    expect(timeAgo(ago(3 * 3600))).toBe("3h ago");
    expect(timeAgo(ago(2 * 86400))).toBe("2d ago");
    expect(timeAgo(ago(2 * 2592000))).toBe("2mo ago");
    expect(timeAgo(ago(3 * 31536000))).toBe("3y ago");
  });
});
