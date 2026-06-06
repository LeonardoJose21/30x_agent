import { NextRequest, NextResponse } from "next/server";
import { getRelevantContext } from "@/lib/retriever";
import { getProvider } from "@/lib/providers";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/lib/providers/base";

const SYSTEM_PROMPT = `Eres el asistente de onboarding de 30X. Respondes preguntas de nuevos miembros del equipo usando únicamente la información de los documentos internos de 30X que se te proporcionan como contexto.

Reglas:
- Responde siempre en español.
- Usa el contexto para responder con la mayor precisión posible.
- Si el contexto contiene información parcial o relacionada, úsala y complementa con lo que esté disponible.
- Nunca inventes datos, nombres, fechas o cifras que no estén en el contexto.
- Sé claro y directo. Usa listas o párrafos según lo que sea más legible.

Cuando no tengas la respuesta:
- No improvises ni adivines.
- Indica claramente que no encontraste esa información en los documentos.
- Orienta al usuario con quién debería hablar según el tema:
  - Dudas sobre estructura, roles o decisiones organizacionales → Chief of Staff
  - Dudas sobre programas, cohortes o métricas → líder del área de Programas
  - Dudas sobre herramientas, accesos técnicos o stack → líder de Tecnología
  - Dudas sobre su primera semana o cultura del equipo → su líder de área directo
  - Dudas generales que no encajan en ninguna categoría → Chief of Staff`;

// Skip retrieval for messages that clearly don't need doc lookup
function isConversational(text: string): boolean {
  const t = text.toLowerCase().trim();
  // Single word
  if (!t.includes(" ")) return true;
  // Starts with a conversational word
  if (/^(gracias|ok|okay|sí|si|no|entendido|perfecto|claro|genial|bien|excelente|hola|hey|hi|bueno|exacto|correcto|listo|dale|sale|chido|obvio|seguro)/.test(t)) return true;
  // References the conversation itself, not the docs
  if (/\b(que (preguntas|dijiste|dije|hemos|he|has)|lo que (te|me|he|has|dijiste)|recuerd|de qu[eé] hemos|conversaci[oó]n|anterior(es)?|hasta ahora|me (dijiste|comentaste)|ya me|ya s[eé])\b/.test(t)) return true;
  return false;
}

function logUnanswered(query: string, target: string) {
  supabase
    .from("unanswered_queries")
    .insert({ query, escalation_target: target })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error("[chat] failed to log unanswered query:", error.message);
      else console.log(`[chat] logged unanswered: "${query.slice(0, 60)}" → ${target}`);
    });
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: Message[] };

    if (!messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const query = lastUserMessage?.content ?? "";

    // Skip retrieval for conversational messages
    const skipRetrieval = isConversational(query);
    const context = skipRetrieval ? "" : await getRelevantContext(query, 10);
    console.log(`[chat] query="${query.slice(0, 60)}" context_chars=${context.length} skip_retrieval=${skipRetrieval}`);

    // Log when zero context returned for a real query
    if (!skipRetrieval && !context && query) {
      logUnanswered(query, "no_context");
    }

    const systemWithContext = context
      ? `${SYSTEM_PROMPT}\n\nCONTEXTO DE DOCUMENTOS:\n${context}`
      : SYSTEM_PROMPT;

    const provider = getProvider();
    const rawStream = await provider.chat(messages, systemWithContext);

    // Intercept stream to detect "No encontré" — the real unanswered signal
    let fullResponse = "";
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        fullResponse += new TextDecoder().decode(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        if (!skipRetrieval && query && fullResponse.toLowerCase().includes("no encontré")) {
          logUnanswered(query, "no_answer_in_docs");
        }
      },
    });

    rawStream.pipeTo(writable);

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[chat] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
