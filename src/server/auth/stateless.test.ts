import { describe, expect, it } from "vitest";
import { isStatelessToken, signSessionToken, verifySessionToken } from "./stateless";

const SECRET = "test-secret";

describe("stateless session tokens", () => {
  it("round-trips a valid token", () => {
    const exp = Date.now() + 60_000;
    const token = signSessionToken("user_123", exp, SECRET);
    expect(isStatelessToken(token)).toBe(true);
    expect(verifySessionToken(token, SECRET)).toBe("user_123");
  });

  it("rejects an expired token", () => {
    const token = signSessionToken("user_123", Date.now() - 1, SECRET);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered user id or expiry", () => {
    const exp = Date.now() + 60_000;
    const token = signSessionToken("user_123", exp, SECRET);
    const [p, uid, e, sig] = token.split(".");
    expect(verifySessionToken(`${p}.user_999.${e}.${sig}`, SECRET)).toBeNull();
    expect(verifySessionToken(`${p}.${uid}.${Number(e) + 100000}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signSessionToken("user_123", Date.now() + 60_000, "other");
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("ignores opaque DB tokens and malformed input", () => {
    expect(isStatelessToken("abc123")).toBe(false);
    expect(verifySessionToken("abc123", SECRET)).toBeNull();
    expect(verifySessionToken("d1.only.two", SECRET)).toBeNull();
    expect(verifySessionToken("d1.", SECRET)).toBeNull();
  });
});
