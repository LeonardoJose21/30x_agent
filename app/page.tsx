"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Message = { role: "user" | "assistant"; content: string };

const E = "cubic-bezier(0.23, 1, 0.32, 1)";

const SUGGESTIONS = [
  "¿Cuál es la misión y visión de 30X?",
  "¿Cómo está organizado el equipo de 30X?",
  "¿Cuáles son los programas principales?",
  "¿Qué herramientas y plataformas usamos?",
  "¿Cuál es el proceso de onboarding para nuevos miembros?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const history = [...messagesRef.current, userMsg];

    setMessages(history);
    setInput("");
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        setMessages((p) => [
          ...p,
          { role: "assistant", content: "Error al conectar. Intenta de nuevo." },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!started) {
          setMessages((p) => [...p, { role: "assistant", content: buffer }]);
          started = true;
        } else {
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: buffer };
            return copy;
          });
        }
      }

      if (!started) {
        setMessages((p) => [
          ...p,
          { role: "assistant", content: "No encontré información relevante." },
        ]);
      }
    } catch {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "Error de conexión." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const canSend = input.trim().length > 0 && !isLoading;
  // Show dots when waiting for the first chunk (last msg is from user)
  const showDots =
    isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg { animation: msgIn 220ms ${E} both; }
        .dot { animation: bounce 1.2s infinite ease-in-out; }
        .suggestion {
          background: #1A1A1A;
          color: #FFFFFF;
          border: 1px solid #2A2A2A;
          border-radius: 4px;
          padding: 8px 14px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          letter-spacing: -0.01em;
          transition: border-color 150ms ${E}, transform 160ms ${E};
          text-align: left;
          line-height: 1.4;
        }
        .suggestion:hover { border-color: #CAFF00; }
        .suggestion:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          .dot { animation: none !important; opacity: 0.6; }
          .msg { animation: none !important; }
          .suggestion { transition: none !important; }
        }
        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1A1A1A; border-radius: 2px; }
        /* Textarea placeholder */
        textarea::placeholder { color: #3A3A3A; }
      `}</style>

      <div
        className="font-sans"
        style={{
          background: "#0A0A0A",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          color: "#FFFFFF",
        }}
      >
        {/* ── Header ── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            height: "52px",
            borderBottom: "1px solid #1A1A1A",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: "#FFFFFF",
              }}
            >
              30X
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "#888888",
                letterSpacing: "-0.02em",
                fontWeight: 400,
              }}
            >
              Asistente de Onboarding
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#CAFF00",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "12px",
                color: "#888888",
                letterSpacing: "-0.01em",
              }}
            >
              Activo
            </span>
          </div>
        </header>

        {/* ── Messages / Empty state ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {messages.length === 0 ? (
            /* Empty state */
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 24px 24px",
                textAlign: "center",
              }}
            >
              <h1
                style={{
                  fontSize: "clamp(64px, 12vw, 96px)",
                  fontWeight: 700,
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                  textWrap: "balance",
                }}
              >
                30X
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "#888888",
                  marginBottom: "36px",
                  letterSpacing: "-0.01em",
                  maxWidth: "300px",
                  lineHeight: 1.55,
                }}
              >
                Pregúntame sobre el equipo, programas o el proceso de onboarding.
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  justifyContent: "center",
                  maxWidth: "540px",
                }}
              >
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message list */
            <div
              style={{
                padding: "24px 24px 8px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="msg"
                  style={{
                    display: "flex",
                    justifyContent:
                      msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      background:
                        msg.role === "user" ? "#CAFF00" : "#141414",
                      color: msg.role === "user" ? "#0A0A0A" : "#FFFFFF",
                      borderRadius: "4px",
                      padding: "10px 14px",
                      fontSize: "14px",
                      lineHeight: 1.65,
                      letterSpacing: "-0.01em",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontWeight: msg.role === "user" ? 500 : 400,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Bouncing dots — shown while waiting for first chunk */}
              {showDots && (
                <div className="msg" style={{ display: "flex" }}>
                  <div
                    style={{
                      background: "#141414",
                      borderRadius: "4px",
                      padding: "14px 18px",
                      display: "flex",
                      gap: "5px",
                      alignItems: "center",
                    }}
                  >
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="dot"
                        style={{
                          display: "inline-block",
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: "#CAFF00",
                          animationDelay: `${delay}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input area ── */}
        <div
          style={{
            borderTop: "1px solid #1A1A1A",
            padding: "14px 24px 16px",
            flexShrink: 0,
          }}
        >
          {/* Composer */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              background: "#111111",
              border: "1px solid #1A1A1A",
              borderRadius: "4px",
              padding: "10px 12px",
              transition: `border-color 150ms ${E}`,
            }}
            onFocusCapture={(e) =>
              (e.currentTarget.style.borderColor = "#CAFF00")
            }
            onBlurCapture={(e) =>
              (e.currentTarget.style.borderColor = "#1A1A1A")
            }
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isLoading}
              placeholder="Escribe tu pregunta…"
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "14px",
                outline: "none",
                resize: "none",
                fontFamily: "inherit",
                letterSpacing: "-0.01em",
                lineHeight: 1.5,
                padding: 0,
                minHeight: "21px",
                maxHeight: "160px",
                overflowY: "auto",
              }}
            />

            {/* Send button */}
            <button
              onClick={() => send(input)}
              disabled={!canSend}
              style={{
                background: canSend ? "#CAFF00" : "#161616",
                border: "none",
                borderRadius: "3px",
                width: "30px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: canSend ? "pointer" : "default",
                flexShrink: 0,
                transition: `background 150ms ${E}, transform 160ms ${E}`,
              }}
              onMouseDown={(e) => {
                if (canSend)
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(0.92)";
              }}
              onMouseUp={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.transform =
                  "scale(1)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.transform =
                  "scale(1)")
              }
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6.5 11V2M6.5 2L2 6.5M6.5 2L11 6.5"
                  stroke={canSend ? "#0A0A0A" : "#333333"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* Footer note */}
          <p
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "#888888",
              marginTop: "8px",
              letterSpacing: "-0.01em",
            }}
          >
            Solo responde con información de los documentos internos de 30X
          </p>
        </div>
      </div>
    </>
  );
}
