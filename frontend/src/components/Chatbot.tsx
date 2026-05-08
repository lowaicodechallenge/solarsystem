"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";

type Msg = {
  role: "user" | "assistant";
  content: string;
  exercises?: { name: string; description: string }[];
};

type Props = {
  userId: string;
  poseContext?: Record<string, unknown>;
  onSymptomsUpdate?: (symptoms: string) => void;
};

export default function Chatbot({ userId, poseContext, onSymptomsUpdate }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "안녕하세요! 저는 AI 피트니스 코치입니다 💪\n어디가 불편하거나 아프신가요? 증상을 알려주시면 맞춤 운동을 추천해드릴게요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await api.sendChat({
        user_id: userId,
        message: text,
        pose_context: poseContext ?? {},
      }) as { reply: string; suggested_exercises: { name: string; description: string }[]; updated_symptoms: string };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
          exercises: res.suggested_exercises?.slice(0, 2),
        },
      ]);

      if (res.updated_symptoms && onSymptomsUpdate) {
        onSymptomsUpdate(res.updated_symptoms);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "죄송합니다, 일시적인 오류가 발생했습니다. 다시 시도해 주세요." },
      ]);
    }
    setLoading(false);
  };

  const quickMessages = [
    "목이 자주 아파요",
    "무릎 통증이 있어요",
    "편두통이 있어요",
    "오늘 어떤 운동 하면 좋을까요?",
  ];

  return (
    <div className="flex flex-col h-[500px] glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center text-lg">🤖</div>
        <div>
          <p className="text-sm font-semibold text-white">AI 코치</p>
          <p className="text-xs text-primary-400">증상 기반 맞춤 운동 추천</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-2">
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "chat-bubble-user text-black font-medium rounded-br-sm"
                    : "chat-bubble-ai text-gray-200 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
              {msg.exercises && msg.exercises.length > 0 && (
                <div className="space-y-1.5">
                  {msg.exercises.map((ex, j) => (
                    <div key={j} className="bg-dark-500 rounded-xl px-3 py-2 text-xs">
                      <p className="text-primary-400 font-semibold">{ex.name}</p>
                      <p className="text-gray-400 mt-0.5 line-clamp-2">{ex.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="chat-bubble-ai px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {quickMessages.map((q) => (
            <button
              key={q}
              onClick={() => { setInput(q); }}
              className="flex-shrink-0 px-3 py-1.5 bg-dark-500 hover:bg-dark-400 text-gray-300 rounded-full text-xs transition-all whitespace-nowrap"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/5 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="증상이나 질문을 입력하세요..."
          className="flex-1 bg-dark-600 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/50 transition-all"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="w-9 h-9 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-black rounded-xl flex items-center justify-center transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
