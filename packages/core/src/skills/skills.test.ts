import { describe, it, expect } from "bun:test";
import { BUNDLED_SKILLS_DATA } from "./bundled-data.generated.ts";

describe("Bundled skills", () => {
  it("includes web_browser_research skill", () => {
    const skill = BUNDLED_SKILLS_DATA.find((s) => s.name === "web_browser_research");
    expect(skill).toBeDefined();
    expect(skill?.category).toBe("web");
    expect(skill?.tools).toContain("web_search");
    expect(skill?.tools).toContain("browser_navigate");
    expect(skill?.tools).toContain("browser_extract");
    expect(skill?.triggers.length).toBeGreaterThan(0);
  });

  it("includes existing web and browser skills", () => {
    const names = BUNDLED_SKILLS_DATA.map((s) => s.name);
    expect(names).toContain("web_research");
    expect(names).toContain("browser_scrape");
    expect(names).toContain("browser_automate");
  });
});
