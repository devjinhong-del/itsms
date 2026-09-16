import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { canSeeAdminMenu, canSeeOrgAssets, hasRole, normalizeRole } from "../src/lib/auth/role";

describe("역할 위계", () => {
  test("모르는 값이나 빈 값은 일반 사용자로 본다", () => {
    assert.equal(normalizeRole(undefined), "general");
    assert.equal(normalizeRole(null), "general");
    assert.equal(normalizeRole("superuser"), "general");
    assert.equal(normalizeRole("manager"), "manager");
  });

  test("상위 역할은 하위 역할 권한을 모두 포함한다", () => {
    assert.equal(hasRole("admin", "general"), true);
    assert.equal(hasRole("admin", "manager"), true);
    assert.equal(hasRole("manager", "general"), true);
    assert.equal(hasRole("manager", "admin"), false);
    assert.equal(hasRole("general", "manager"), false);
  });

  test("조직 자산 현황은 담당자부터, 관리자 메뉴는 관리자만", () => {
    assert.equal(canSeeOrgAssets("general"), false);
    assert.equal(canSeeOrgAssets("manager"), true);
    assert.equal(canSeeOrgAssets("admin"), true);

    assert.equal(canSeeAdminMenu("manager"), false);
    assert.equal(canSeeAdminMenu("admin"), true);
  });
});
