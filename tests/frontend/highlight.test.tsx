import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightedCode } from "@/components/ui/highlight";

describe("HighlightedCode", () => {
  it("classifies language tokens and renders code as text", () => {
    const { container } = render(
      <HighlightedCode
        language="typescript"
        code={'const message = "<script>alert(1)</script>";'}
      />
    );

    expect(container.querySelector(".code-token-keyword")?.textContent).toBe("const");
    expect(container.querySelector(".code-token-string")?.textContent).toContain("<script>");
    expect(container.querySelector("script")).toBeNull();
  });
});
