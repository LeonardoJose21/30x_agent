# 30X Onboarding Agent — Retrospectiva técnica

## Qué es el proyecto

Agente conversacional de onboarding para nuevos miembros del equipo 30X. Responde preguntas usando exclusivamente documentos internos indexados. No improvisa ni inventa. Si no sabe, dice quién puede responder.

---

## Arquitectura

```
Usuario escribe → /api/chat
    ↓
Intent check — ¿es un mensaje conversacional?
    ↓ no                          ↓ sí
Embed query                   Skip retrieval
(gemini-embedding-001)
    ↓
Supabase pgvector cosine similarity
    ↓
Top chunks filtrados (sim ≥ 0.2)
    ↓
Si todos < 0.5 → fallback topK=14
    ↓
Contexto inyectado en system prompt
    ↓
Gemini 2.5 Flash genera respuesta (streaming)
    ↓
TransformStream intercepta el stream
→ pasa chunks al cliente en tiempo real
→ al terminar: si respuesta contiene "no encontré" → log a unanswered_queries
    ↓
Cliente recibe stream y renderiza markdown
```

### Stack
- **Framework**: Next.js 16 App Router + TypeScript + Tailwind 4
- **LLM**: Gemini 2.5 Flash (default, free tier) | Claude Haiku | GPT-4o mini
- **Embeddings**: gemini-embedding-001 (768 dims) | voyage-3 | text-embedding-3-small
- **Vector DB**: Supabase pgvector, IVFFlat index, cosine similarity
- **Chunking**: pdf-parse → tiktoken cl100k_base, 256 tokens, 50 overlap
- **Admin**: `/admin` con auth gate, lista de docs, re-index, upload, unanswered queries

---

## Problemas encontrados y soluciones

---

### 1. El agente siempre respondía "No encontré esa información"

**Por qué era un problema**: El agente era completamente inútil. Un miembro nuevo preguntaba cosas básicas — misión, equipo, programas — y el agente negaba tener información aunque los documentos sí la contenían. El propósito central del proyecto era fallando.

**Qué lo causaba**:
- Los documentos se habían indexado con un modelo de embeddings roto (embeddings inválidos almacenados en Supabase). Las búsquedas de similaridad devolvían basura.
- Además, los chunks eran de 500 tokens — demasiado grandes para documentos cortos. Resultado: solo 7 chunks para 3 documentos. Muy pocas piezas para encontrar respuestas específicas.
- El system prompt era demasiado estricto: si la respuesta no estaba palabra por palabra, el modelo decía que no sabía.

**Solución**:
1. Corregir el modelo de embeddings y re-indexar todos los documentos desde cero
2. Reducir el tamaño de chunk de 500 a 256 tokens — pasamos de 7 a 14 chunks, cada uno más preciso
3. Suavizar el system prompt: si hay información parcial o relacionada, usarla

---

### 2. El agente no sabía cuándo escalar ni a quién

**Por qué era un problema**: Cuando el agente no encontraba información, simplemente decía "No encontré esa información en los documentos internos de 30X" y se quedaba ahí. Para un miembro nuevo eso es un callejón sin salida — no sabe a quién recurrir, se queda bloqueado.

El requerimiento RF-03 pedía explícitamente que el agente orientara al usuario con la persona correcta según el tema. No estaba implementado.

**Solución**: Añadir al system prompt una tabla de escalado por categoría de pregunta — si no sabe sobre estructura o roles, dice que hable con el Chief of Staff; si es sobre herramientas, con el líder de Tecnología; etc. El agente ahora cierra cada respuesta negativa con una dirección accionable.

---

### 3. No había forma de saber qué preguntas el agente no podía responder

**Por qué era un problema**: El agente fallaba en silencio. No había visibilidad de qué información le faltaba ni con qué frecuencia. Sin eso, es imposible mejorar la base de conocimiento — no sabes qué documentos agregar ni qué actualizar.

**Qué lo causaba**: El primer intento de detección usaba un umbral de similaridad (si todos los scores < 0.5, loggear). El problema es que queries como "¿cuándo sale 30X a la bolsa?" devolvían scores de 0.522 — técnicamente sobre el umbral — y nunca se loggeaban aunque el agente no pudiera responder.

**Solución**: En vez de inferir si el agente "sabe" a partir de los scores de retrieval, interceptar el stream de respuesta y leer lo que el modelo realmente dice. Si la respuesta contiene "no encontré", se registra en Supabase con la query y la categoría. El admin panel muestra estas queries agrupadas por frecuencia para saber qué documentos agregar.

---

### 4. El agente procesaba cada mensaje como si fuera una consulta a los documentos

**Por qué era un problema**: Mensajes como "gracias", "ok", "¿qué me preguntaste?" disparaban el proceso completo de embedding y búsqueda en Supabase — operaciones que cuestan tiempo y recursos. Para esos mensajes, el contexto recuperado era irrelevante y solo añadía ruido. Un agente que tarda en responder "gracias" se siente torpe.

**Solución**: Añadir un intent check antes del retrieval. Si el mensaje es una sola palabra, empieza con una palabra conversacional (ok, gracias, sí, hola, entendido...) o hace referencia a la conversación misma (recuerdas, que dijiste, conversación anterior), se salta el retrieval por completo y va directo al modelo. La conversación fluye naturalmente sin latencia innecesaria.

---

## Requerimientos funcionales — estado final

| RF | Descripción | Estado |
|---|---|---|
| RF-01 | Respuestas basadas solo en documentos | ✅ |
| RF-02 | Memoria de conversación dentro de sesión | ✅ |
| RF-03 | Escalado inteligente a rol correcto cuando no sabe | ✅ |
| RF-04 | Interfaz usable por no técnicos | ✅ |
| RF-05 | README con instrucciones de operación | ✅ |

---

## Mejoras adicionales implementadas (fuera de scope original)

- **Admin panel** — gestión de documentos, upload drag & drop, re-index individual o masivo
- **Unanswered queries tracking** — registro automático, vista en admin con frecuencia, botón de limpieza
- **Confidence fallback** — si los scores son bajos, amplía la búsqueda automáticamente
- **Markdown rendering** — el chat renderiza bold, bullets y listas anidadas como las produce el modelo
- **Validación de indexación** — guard que detecta PDFs vacíos o escaneados antes de indexar
