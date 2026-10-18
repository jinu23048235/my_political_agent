import test from "node:test";
import assert from "node:assert/strict";
import { canCitizenParticipate, containsRegion, dataMode } from "../src/lib/domain";
test("upper feeds do not expand original-post participation", () => {
  const certs = [{ regionCode: "seongsan1", expiresAt: new Date("2099-01-01") }];
  assert.equal(canCitizenParticipate("citizen", certs, "mapo"), true);
  assert.equal(canCitizenParticipate("citizen", certs, "mangwon1"), false);
  assert.equal(canCitizenParticipate("staff", certs, "mapo"), false);
  assert.equal(canCitizenParticipate("citizen", certs, "mapo", new Date("2099-01-01")), false);
});
test("region traversal terminates on invalid cycles", () => {
  assert.equal(containsRegion("missing", "a", [{ code: "a", name: "a", parentCode: "b" }, { code: "b", name: "b", parentCode: "a" }]), false);
});
test("sample data cannot be enabled in production", () => {
  assert.throws(() => dataMode({ NODE_ENV: "production", APP_DATA_MODE: "sample" }));
  assert.equal(dataMode({ NODE_ENV: "production" }), "empty");
  assert.equal(dataMode({ NODE_ENV: "development", APP_DATA_MODE: "sample" }), "sample");
});
