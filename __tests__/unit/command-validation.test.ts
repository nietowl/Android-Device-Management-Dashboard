/**
 * Unit Tests for Command Validation
 */

import { validateCommand, isCommandAllowed, getAllowedCommands } from "@/lib/utils/command-validation";

describe("Command Validation", () => {
  describe("isCommandAllowed", () => {
    it("should allow valid commands", () => {
      expect(isCommandAllowed("getinfo")).toBe(true);
      expect(isCommandAllowed("getsms")).toBe(true);
      expect(isCommandAllowed("tap")).toBe(true);
    });

    it("should reject invalid commands", () => {
      expect(isCommandAllowed("rm -rf /")).toBe(false);
      expect(isCommandAllowed("delete-all")).toBe(false);
      expect(isCommandAllowed("")).toBe(false);
    });
  });

  describe("validateCommand", () => {
    it("should validate allowed commands", () => {
      expect(() => validateCommand("getinfo")).not.toThrow();
      expect(() => validateCommand("getsms", "inbox|50|10")).not.toThrow();
      expect(() => validateCommand("tap", undefined, { x: 100, y: 200 })).not.toThrow();
    });

    it("should reject commands not in whitelist", () => {
      expect(() => validateCommand("rm -rf /")).toThrow();
      expect(() => validateCommand("exec")).toThrow();
      expect(() => validateCommand("eval")).toThrow();
    });

    it("should reject commands with dangerous characters", () => {
      expect(() => validateCommand("get<script>")).toThrow();
      expect(() => validateCommand("get/info")).toThrow();
    });

    it("should reject overly long parameters", () => {
      const longParam = "a".repeat(1001);
      expect(() => validateCommand("getsms", longParam)).toThrow();
    });

    it("should reject parameters with dangerous patterns", () => {
      expect(() => validateCommand("getsms", "<script>alert('xss')</script>")).toThrow();
      expect(() => validateCommand("getsms", "javascript:alert('xss')")).toThrow();
      expect(() => validateCommand("getsms", "onclick=alert('xss')")).toThrow();
    });

    it("should reject overly nested data objects", () => {
      const deeplyNested: any = {};
      let current = deeplyNested;
      for (let i = 0; i < 11; i++) {
        current.nested = {};
        current = current.nested;
      }
      expect(() => validateCommand("tap", undefined, deeplyNested)).toThrow();
    });

    it("should reject overly large data objects", () => {
      const largeData = { data: "x".repeat(100001) };
      expect(() => validateCommand("tap", undefined, largeData)).toThrow();
    });
  });

  describe("getAllowedCommands", () => {
    it("should return a list of allowed commands", () => {
      const commands = getAllowedCommands();
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands).toContain("getinfo");
      expect(commands).toContain("getsms");
    });
  });
});

