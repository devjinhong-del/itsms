import Link from "next/link";
import type { Metadata } from "next";

// 로그인 없이 볼 수 있는 유일한 화면. 실제 데이터는 한 줄도 조회하지 않고,
// 이 시스템이 무엇을 하는지만 설명한다(사내 데이터는 로그인 뒤에만 보인다).
export const metadata: Metadata = {
  title: "ITSMS 소개",
  description: "휴대폰 바코드로 자산 실사하고 비용 절감 기회까지 찾아주는 사내 IT 서비스 관리 시스템",
};

const FEATURES = [
  {
    title: "휴대폰 바코드 실사",
    body: "카메라로 자산 바코드를 비추면 자산번호와 사용자 정보가 자동으로 채워집니다. 실제 사용자가 다르면 그 자리에서 고쳐 제출하고, 촬영한 사진이 증빙으로 남습니다.",
    shot: "/screens/audit-mobile.jpg",
    tall: true,
  },
  {
    title: "모든 OA 현황",
    body: "전사 장비를 종류·부서·브랜드로 나눠 봅니다. 자산번호·사용자·부서로 검색해 개별 장비까지 찾아갑니다.",
    shot: "/screens/oa-overview.png",
  },
  {
    title: "OA Report & Insight",
    body: "퇴사자 명의로 남은 장비, 계약이 끝났는데 회수되지 않은 장비, 중복 보유를 자동으로 추려 회수 시 절감액을 제시합니다.",
    shot: "/screens/oa-report.png",
  },
  {
    title: "License 관리",
    body: "구독 수량 대비 사용률을 보여주고, 할당률이 높은 라이선스를 따로 세어 추가 구매 시점을 알려줍니다.",
    shot: "/screens/license.png",
  },
  {
    title: "AI 도우미",
    body: "올린 문서와 사내 자료만 근거로 답합니다. 자료에 없는 내용은 지어내지 않고 “문서에 없습니다”라고만 답하며, 근거가 된 자료를 출처로 보여줍니다.",
    shot: "/screens/chatbot.png",
    tall: true,
  },
];

const STACK = [
  "Next.js 16 (App Router)",
  "TypeScript",
  "Tailwind CSS",
  "Supabase (Postgres · Auth · Storage · pgvector)",
  "@zxing/browser",
  "OpenAI gpt-4o-mini",
  "Python 수집 배치",
  "Vercel",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="bg-[#0f1b33] px-6 py-16 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-400">사내 IT 서비스 관리 시스템</p>
          <h1 className="mt-3 text-5xl font-extrabold">ITSMS</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            흩어져 있던 사내 IT 자산·계정·라이선스를 한 곳에서 보고,
            <br />
            자산 실사는 휴대폰 카메라로 끝냅니다.
          </p>

          <div className="mt-10 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["1,010대", "관리 중인 자산"],
              ["1,097개", "로그인 계정"],
              ["265조각", "AI 학습 자료"],
              ["47대", "회수 대상 발굴"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl bg-white/5 p-4">
                <p className="text-2xl font-extrabold text-white">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-[#0f1b33] transition hover:bg-amber-300"
            >
              사내 계정으로 로그인
            </Link>
            <a
              href="https://github.com/devjinhong-del/itsms"
              className="rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              GitHub 저장소 보기
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-2xl font-bold">무엇을 해결하나</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-600">
          “이 노트북 누가 쓰고 있죠?”라는 한 줄짜리 질문에 답하려면 렌탈사이트·Microsoft 365·요청서 문서를 번갈아 열어
          대조해야 했습니다. 현황은 실시간이 아니고, 실사는 종이와 엑셀로 하고, 쓰지 않는 장비의 렌탈료가 계속 나갔습니다.
          ITSMS는 <strong>데이터를 모아 쌓고, 현장에서 확인하고, 한 화면에서 보는</strong> 세 단계로 이 일을 바꿉니다.
        </p>

        <div className="mt-12 flex flex-col gap-14">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
              <div className="md:w-1/3">
                <h3 className="text-lg font-bold text-[#1d428a]">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{feature.body}</p>
              </div>
              <div className="md:w-2/3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={feature.shot}
                  alt={`${feature.title} 화면`}
                  className={`rounded-xl border border-gray-200 shadow-sm ${feature.tall ? "max-h-[420px] w-auto" : "w-full"}`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50 px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold">어떻게 만들었나</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-gray-600">
            기획(PRD) → 설계(DESIGN) → 계획(PLAN) → 구현 → 검증을 AI와 함께 반복해 만들었습니다. 사내 인사 정보를 다루기
            때문에 모든 표에 접근 제어를 켜고, 조회는 권한을 확인한 서버 코드만 수행합니다. 값이 바뀌면 지우지 않고 이전
            값을 만료 처리해 이력을 남깁니다.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2">
            {STACK.map((item) => (
              <li key={item} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="px-6 py-10 text-center text-xs text-gray-400">
        제이시스메디칼 IT팀 · 사내 전용 서비스입니다. 데이터는 로그인 후에만 조회됩니다.
      </footer>
    </main>
  );
}
