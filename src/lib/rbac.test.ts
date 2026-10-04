import { describe, expect, it } from "vitest";
import { can, isRole, isStaff } from "./rbac";

describe("rbac", () => {
  it("gives owners everything and clients only self access", () => {
    expect(can("OWNER", "users:manage")).toBe(true);
    expect(can("CLIENT", "clients:read")).toBe(false);
    expect(can("CLIENT", "client:self")).toBe(true);
    expect(can("COACH", "client:self")).toBe(false);
  });
  it("limits assistants and coaches", () => {
    expect(can("ASSISTANT", "programs:write")).toBe(false);
    expect(can("ASSISTANT", "notes:write")).toBe(true);
    expect(can("COACH", "clients:delete")).toBe(false);
    expect(can("COACH", "business:write")).toBe(false);
    expect(can("COACH", "intelligence:run")).toBe(true);
  });
  it("identifies staff and validates roles", () => {
    expect(isStaff("COACH")).toBe(true);
    expect(isStaff("CLIENT")).toBe(false);
    expect(isRole("HACKER")).toBe(false);
  });
});
