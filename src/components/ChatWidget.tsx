"use client";

import { useEffect, useRef, useState } from "react";
import { askChatbot, type ChatTurn } from "@/app/chat/actions";

// AI 에이전트 아이콘 — 말풍선 안에 로봇 얼굴(눈·안테나)을 넣은 단순한 형태.
function AgentIcon({ className = "h-6 w-6" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.2 3.2A1 1 0 014 18.4V16a2.5 2.5 0 01-.5-1.5v-9z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M6.5 3.5h11A2.5 2.5 0 0120 6v7.5a2.5 2.5 0 01-2.5 2.5H10.4l-3.8 2.9a.8.8 0 01-1.3-.64V16A2.5 2.5 0 014 13.5V6a2.5 2.5 0 012.5-2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="9.5" r="1.3" fill="currentColor" />
      <circle cx="14.5" cy="9.5" r="1.3" fill="currentColor" />
      <path d="M12 3.5V1.8M10.4 12.6h3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="1.4" r="1" fill="currentColor" />
    </svg>
  );
}

const GREETING =
  "안녕하세요. 사내 문서와 자산·라이선스 자료를 바탕으로 답해 드립니다.\n무엇이 궁금하신가요?";

interface Message extends ChatTurn {
  sources?: string[];
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING }]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 새 메시지가 붙으면 항상 마지막 줄이 보이게 내린다.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open]);

  async function send() {
    const question = input.trim();
    if (!question || pending) return;

    const history: ChatTurn[] = messages
      .filter((message) => message.content !== GREETING)
      .map((message) => ({ role: message.role, content: message.content }));

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setPending(true);

    try {
      const reply = await askChatbot(question, history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply.answer, sources: reply.sources }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "답변을 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* 화면 오른쪽 아래 고정 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "AI 도우미 닫기" : "AI 도우미 열기"}
        title="AI 도우미"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1d428a] text-white shadow-lg transition hover:bg-[#173568] hover:shadow-xl"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <AgentIcon className="h-7 w-7" />
        )}
      </button>

      {/* 채팅 구름 — 페이지 이동 없이 이 자리에서 열리고, 대화가 길어지면 안쪽에서 스크롤된다 */}
      {open && (
        <section className="fixed bottom-24 right-6 z-40 flex h-[520px] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <header className="flex items-center gap-2 border-b border-gray-100 bg-[#1d428a] px-4 py-3 text-white">
            <AgentIcon className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm font-bold">ITSMS AI 도우미</p>
              <p className="text-[11px] text-white/70">올려둔 문서와 사내 자료만 근거로 답합니다</p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-3 py-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-sm bg-[#1d428a] text-white"
                      : "rounded-bl-sm border border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  {message.content}
                  {message.sources && message.sources.length > 0 && (
                    <p className="mt-2 border-t border-gray-100 pt-1.5 text-[11px] text-gray-400">
                      출처: {message.sources.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-400">
                  자료를 찾아보는 중입니다...
                </div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-gray-100 bg-white p-2.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter로 보내고, Shift+Enter는 줄바꿈
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="궁금한 내용을 입력해 주세요."
              className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-[#1d428a]"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={pending || !input.trim()}
              className="h-[38px] shrink-0 rounded-xl bg-[#1d428a] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#173568] disabled:bg-gray-200 disabled:text-gray-400"
            >
              보내기
            </button>
          </div>
        </section>
      )}
    </>
  );
}
