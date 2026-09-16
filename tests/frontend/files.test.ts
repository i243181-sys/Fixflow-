import { describe, expect, it } from "vitest";
import { readDebugFile } from "@/lib/files";

describe("debug attachments", () => {
  it("reads text content instead of sending only a filename", async () => {
    await expect(readDebugFile(new File(["print('hello')"], "example.py"))).resolves.toEqual({
      name: "example.py", content: "print('hello')",
    });
  });

  it("rejects oversized, unsupported, empty, and binary attachments", async () => {
    await expect(readDebugFile(new File(["x".repeat(50_001)], "large.txt"))).rejects.toThrow("50 KB");
    await expect(readDebugFile(new File(["pdf"], "guide.pdf"))).rejects.toThrow("Knowledge Sources");
    await expect(readDebugFile(new File(["  "], "empty.txt"))).rejects.toThrow("nonempty");
    await expect(readDebugFile(new File([new Uint8Array([0, 1, 2])], "binary.txt"))).rejects.toThrow("UTF-8");
  });
});
