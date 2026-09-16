"use server";

import { getChatbotAccess } from "@/lib/rag/access";
import { answerQuestion } from "@/lib/rag/answer";
import type { ChatMessage } from "@/lib/rag/openai";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  ok: boolean;
  answer: string;
  sources: string[];
}

// 챗봇 질문 처리. 화면에서 숨기는 것과 별개로, 서버에서도 매번 권한을 다시 확인한다.
export async function askChatbot(question: string, history: ChatTurn[]): Promise<ChatReply> {
  const access = await getChatbotAccess();
  if (!access.canChat) {
    return { ok: false, answer: "이 기능을 사용할 권한이 없습니다.", sources: [] };
  }

  try {
    const result = await answerQuestion(
      question,
      history.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage),
    );
    return { ok: true, answer: result.answer, sources: result.sources };
  } catch (error) {
    console.error("챗봇 답변 실패:", error);
    return { ok: false, answer: "답변을 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", sources: [] };
  }
}
