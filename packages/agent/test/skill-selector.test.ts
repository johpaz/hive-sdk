import { describe, test, expect } from "bun:test";

describe("Skill Selector Module", () => {
  test("should load skill-selector module", async () => {
    const mod = await import("../src/skill-selector");
    expect(mod).toBeDefined();
  });

  test("should export selectSkills function", async () => {
    const { selectSkills } = await import("../src/skill-selector");
    expect(typeof selectSkills).toBe("function");
  });

  test("should export getMinimalSkills function", async () => {
    const { getMinimalSkills } = await import("../src/skill-selector");
    expect(typeof getMinimalSkills).toBe("function");
  });

  test("should export getAllSkillsFromDB function", async () => {
    const { getAllSkillsFromDB } = await import("../src/skill-selector");
    expect(typeof getAllSkillsFromDB).toBe("function");
  });
});