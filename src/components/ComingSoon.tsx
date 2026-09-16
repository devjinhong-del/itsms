// 아직 실제 화면을 만들기 전인 메뉴 페이지들의 공통 표시 — 공사 이모지 + 메뉴 이름 + "준비중".
export default function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <span className="text-5xl">🚧</span>
      <p className="text-base font-semibold text-gray-700">{label} 준비중</p>
    </div>
  );
}
