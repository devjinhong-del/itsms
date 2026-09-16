import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { NAV_ITEMS } from "@/lib/nav";
import { SectionCard, StatTile, Table, EmptyRow, BarList, Badge } from "@/components/dashboard";

// 접속 로그는 계속 쌓이므로 캐시하지 않고 매번 최신 상태로 읽는다.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AccessLog {
  id: number;
  user_email: string | null;
  user_name: string | null;
  event_type: "login" | "page_view";
  path: string | null;
  created_at: string;
}

const PATH_LABEL = new Map<string, string>(NAV_ITEMS.map((item) => [item.href, item.label]));
PATH_LABEL.set("/login", "로그인");
PATH_LABEL.set("/audit_oa", "OA 자산 실사(모바일)");

function labelOf(path: string | null) {
  if (!path) return "-";
  return PATH_LABEL.get(path) ?? path;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AdminAccessLogPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("access_logs")
    .select("id, user_email, user_name, event_type, path, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const logs = (data ?? []) as AccessLog[];
  const logins = logs.filter((l) => l.event_type === "login");
  const pageViews = logs.filter((l) => l.event_type === "page_view");

  const todayKey = new Date().toDateString();
  const todayLogs = logs.filter((l) => new Date(l.created_at).toDateString() === todayKey);
  const uniqueUsers = new Set(logs.map((l) => l.user_email).filter(Boolean));

  // 어떤 화면이 많이 쓰이는지 — 메뉴 개선 판단에 쓸 수 있는 기본 지표
  const byPath = new Map<string, number>();
  for (const log of pageViews) {
    const key = labelOf(log.path);
    byPath.set(key, (byPath.get(key) ?? 0) + 1);
  }
  const topPaths = [...byPath.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  // 사용자별 활동량
  const byUser = new Map<string, { name: string | null; logins: number; views: number; last: string }>();
  for (const log of logs) {
    const key = log.user_email ?? "(미상)";
    const entry = byUser.get(key) ?? { name: log.user_name, logins: 0, views: 0, last: log.created_at };
    if (log.event_type === "login") entry.logins += 1;
    else entry.views += 1;
    if (log.created_at > entry.last) entry.last = log.created_at;
    byUser.set(key, entry);
  }
  const users = [...byUser.entries()]
    .map(([email, v]) => ({ email, ...v }))
    .sort((a, b) => b.views + b.logins - (a.views + a.logins));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="기록된 활동" value={logs.length.toLocaleString()} unit="건" sub="최근 500건 기준" tone="brand" />
        <StatTile label="로그인" value={logins.length.toLocaleString()} unit="회" sub={`고유 사용자 ${uniqueUsers.size}명`} />
        <StatTile label="화면 조회" value={pageViews.length.toLocaleString()} unit="회" sub="메뉴 이동 기록" />
        <StatTile label="오늘 활동" value={todayLogs.length.toLocaleString()} unit="건" sub="오늘 발생한 로그" />
      </div>

      <SectionCard
        title="접속 기록"
        description="최근 기록이 맨 위 · 로그인과 화면 이동을 함께 보여줍니다"
        right={<Badge tone="muted">최근 500건</Badge>}
      >
        <Table head={["시각", "계정", "이름", "구분", "화면", "경로"]}>
          {logs.slice(0, 100).map((log) => (
            <tr key={log.id} className="border-t border-gray-100">
              <td className="px-3 py-2.5 font-medium tabular-nums">{formatDateTime(log.created_at)}</td>
              <td className="px-3 py-2.5 text-gray-600">{log.user_email ?? "-"}</td>
              <td className="px-3 py-2.5">{log.user_name ?? "-"}</td>
              <td className="px-3 py-2.5">
                {log.event_type === "login" ? <Badge tone="ok">로그인</Badge> : <Badge tone="muted">화면 조회</Badge>}
              </td>
              <td className="px-3 py-2.5">{labelOf(log.path)}</td>
              <td className="px-3 py-2.5 text-gray-400">{log.path ?? "-"}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <EmptyRow colSpan={6} text="아직 기록된 접속 로그가 없습니다. 로그인하거나 메뉴를 이동하면 쌓입니다." />
          )}
        </Table>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="많이 열린 화면" description="화면 조회 수 기준 상위 10개">
          {topPaths.length > 0 ? (
            <BarList items={topPaths.slice(0, 10)} unit="회" />
          ) : (
            <p className="py-8 text-center text-xs text-gray-400">화면 조회 기록이 없습니다.</p>
          )}
        </SectionCard>

        <SectionCard title="사용자별 활동" description="활동량이 많은 순">
          <Table head={["계정", "이름", "로그인", "화면 조회", "마지막 활동"]}>
            {users.slice(0, 10).map((user) => (
              <tr key={user.email} className="border-t border-gray-100">
                <td className="px-3 py-2.5 font-medium">{user.email}</td>
                <td className="px-3 py-2.5">{user.name ?? "-"}</td>
                <td className="px-3 py-2.5 tabular-nums">{user.logins}</td>
                <td className="px-3 py-2.5 tabular-nums">{user.views}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-500">{formatDateTime(user.last)}</td>
              </tr>
            ))}
            {users.length === 0 && <EmptyRow colSpan={5} text="기록이 없습니다." />}
          </Table>
        </SectionCard>
      </div>
    </div>
  );
}
