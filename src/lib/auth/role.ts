// 역할(role)별로 무엇을 볼 수 있는지 한 곳에서 정한다.
// 상위 역할은 하위 역할의 권한을 모두 포함한다(일반 ⊂ 담당자 ⊂ 관리자).
//   general : 개인 자산 현황
//   manager : general + 조직 자산 현황
//   admin   : manager + 관리자 메뉴 전체
export type Role = "general" | "manager" | "admin";

const ORDER: Role[] = ["general", "manager", "admin"];

export function normalizeRole(value: string | null | undefined): Role {
  return ORDER.includes(value as Role) ? (value as Role) : "general";
}

// 주어진 역할이 최소 요구 역할 이상인지
export function hasRole(role: string | null | undefined, minimum: Role) {
  return ORDER.indexOf(normalizeRole(role)) >= ORDER.indexOf(minimum);
}

export const canSeeOrgAssets = (role: string | null | undefined) => hasRole(role, "manager");
export const canSeeAdminMenu = (role: string | null | undefined) => hasRole(role, "admin");

export const ROLE_LABEL: Record<Role, string> = {
  general: "일반",
  manager: "담당자",
  admin: "관리자",
};
