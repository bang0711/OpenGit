import { describe, expect, it } from "vitest";
import { hrefToPath } from "./link";

describe("hrefToPath", () => {
  it("passes string hrefs through", () => {
    expect(hrefToPath("/")).toBe("/");
    expect(hrefToPath("/diff?sha=x")).toBe("/diff?sha=x");
  });

  it("serializes a {pathname, query} object", () => {
    expect(
      hrefToPath({ pathname: "/diff", query: { sha: "abc", file: "a.ts" } }),
    ).toBe("/diff?sha=abc&file=a.ts");
  });

  it("drops undefined query values", () => {
    expect(
      hrefToPath({ pathname: "/diff", query: { wt: "1", sha: undefined } }),
    ).toBe("/diff?wt=1");
  });

  it("omits the ? when there is no query", () => {
    expect(hrefToPath({ pathname: "/blame" })).toBe("/blame");
  });

  it("encodes special characters", () => {
    expect(
      hrefToPath({ pathname: "/diff", query: { file: "src/a b.ts" } }),
    ).toContain("file=src%2Fa+b.ts");
  });
});
