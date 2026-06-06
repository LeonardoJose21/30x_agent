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

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: Message[] };

    if (!messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const query = lastUserMessage?.content ?? "";

    const context = await getRelevantContext(query, 10);
    console.log(`[chat] query="${query.slice(0, 60)}" context_chars=${context.length}`);

    // Log queries that returned zero context — definitive "not in docs" signal
    if (!context && query) {
      supabase
        .from("unanswered_queries")
        .insert({ query, escalation_target: "no_context" })
        .then(({ error }) => {
          if (error) console.error("[chat] failed to log unanswered query:", error.message);
        });
    }

    const systemWithContext = context
      ? `${SYSTEM_PROMPT}\n\nCONTEXTO DE DOCUMENTOS:\n${context}`
      : SYSTEM_PROMPT;

    const provider = getProvider();
    const stream = await provider.chat(messages, systemWithContext);

    return new NextResponse(stream, {
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
