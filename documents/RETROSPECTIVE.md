# 30X Onboarding Agent — Retrospectiva técnica

## Qué es el proyecto

Agente conversacional de onboarding para nuevos miembros del equipo 30X. Responde preguntas usando exclusivamente documentos internos indexados. No improvisa ni inventa. Si no sabe, dice quién puede responder.

---

## Arquitectura

```
Usuario escribe → /api/chat
    ↓
Intent check — ¿es un mensaje conversacional? (single word, "gracias", "ok", referencia a la conv)
    ↓ no                          ↓ sí
Embed query                   Skip retrieval
(gemini-embedding-001)
    ↓
Supabase pgvector
match_documents RPC
cosine similarity
    ↓
Top chunks filtrados (sim ≥ 0.2)
    ↓
Si todos < 0.5 → fallback topK=14 (corpus ≤ 50 chunks)
    ↓
Contexto inyectado en system prompt
    ↓
Gemini 2.5 Flash genera respuesta
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
- **Admin**: UI en `/admin` con auth gate, lista de docs, re-index, upload, unanswered queries

---

## Problemas encontrados y soluciones

---

### 1. pdf-parse no se podía importar en Next.js

**Error**: `Export default doesn't exist in target module`

**Causa**: Next.js (Turbopack) trata los módulos CJS diferente. `pdf-parse/index.js` ejecuta un `fs.readFileSync("test/data/05-versions-space.pdf")` al momento de ser importado porque el check de `require.main` falla bajo el bundler. Resultado: crash en tiempo de importación.

**Solución**:
1. Añadir `serverExternalPackages: ["pdf-parse", "tiktoken"]` en `next.config.ts`
2. Importar el módulo interno directamente para saltarse `index.js`:
```typescript
const mod = await import("pdf-parse/lib/pdf-parse.js");
const pdfParse = (mod.default ?? mod) as PdfParseFn;
```
3. Bajar de `pdf-parse@2.x` a `pdf-parse@1.1.1` — v2 cambió la API a clase, ya no exporta función

---

### 2. Gemini embeddings: modelo no encontrado (múltiples rondas)

**Error 1**: `text-embedding-004 is not found for API version v1beta`

**Causa**: El SDK `@google/generative-ai` usa el endpoint v1beta. El modelo `text-embedding-004` solo existe en v1.

**Error 2**: `models/embedding-001 is not found for API version v1`

**Causa**: El nombre también era incorrecto.

**Solución**: Llamar directamente al REST endpoint v1 y usar el nombre correcto del modelo descubierto via ListModels:
```typescript
fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent?key=...`)
// con outputDimensionality: 768
```

---

### 3. Dimensión de vectores incorrecta (1536 vs 768)

**Error**: Mismatch entre columna `vector(1536)` en Supabase y los embeddings de 768 dims que produce `gemini-embedding-001`.

**Causa**: La migración original usó 1536 (dimensión de OpenAI). Al cambiar a Gemini no se actualizó.

**Solución**: Actualizar `001_documents.sql` a `vector(768)` y re-crear la tabla en Supabase. Re-indexar todos los documentos.

---

### 4. Modelo de chat deprecado

**Error**: `gemini-2.0-flash is no longer available`

**Solución**: Actualizar a `gemini-2.5-flash` (verificado via ListModels API).

---

### 5. POST /api/chat → 404

**Causa**: El route handler `app/api/chat/route.ts` nunca había sido creado. El proyecto arrancó sin él.

**Solución**: Crear el archivo con la lógica completa de RAG + streaming.

---

### 6. El agente siempre respondía "No encontré esa información"

**Síntoma**: Aun con `context_chars=2935`, el modelo negaba tener información.

**Causas**:
- System prompt demasiado estricto ("si no está exactamente, di que no")
- Solo 7 chunks totales para 3 documentos (chunks de 500 tokens en docs cortos = muy pocas piezas)
- Threshold de similaridad en 0.4 bloqueaba chunks válidos
- Embeddings corruptos de intentos fallidos de modelos anteriores

**Soluciones**:
1. Suavizar system prompt: "si hay información parcial o relacionada, úsala"
2. Reducir chunk size: 500 → 256 tokens (7 chunks → 14 chunks)
3. Bajar threshold: 0.4 → 0.2
4. Re-indexar todos los documentos tras corregir el modelo de embeddings

---

### 7. Solo 7 chunks para 3 documentos

**Hipótesis inicial**: Bug en la función de chunking.

**Diagnóstico**: Correr `scripts/verify-chunks.mjs` sin tocar Supabase reveló los conteos reales.

**Realidad**: No había bug. Con docs de ~600–1100 tokens y chunks de 500 tokens, matemáticamente salen 2–3 chunks por documento. El chunking era correcto — el tamaño era el problema.

**Solución**: Reducir `CHUNK_TOKENS` de 500 a 256. Ahora produce ~14 chunks.

---

### 8. pdf-parse vs pdfjs-dist

**Pregunta**: ¿Está pdf-parse extrayendo mal el contenido?

**Diagnóstico**: Script `scripts/compare-parsers.mjs` comparó ambas librerías en los 4 PDFs.

**Resultado**:
```
30X_Doc1: pdf-parse 2530 chars | pdfjs-dist 2602 chars (+3%)
30X_Doc2: pdf-parse 2953 chars | pdfjs-dist 3153 chars (+7%)
30X_Doc3: pdf-parse 4576 chars | pdfjs-dist 4806 chars (+5%)
```

**Conclusión**: Diferencia insignificante. pdf-parse está bien. Los docs son genuinamente cortos.

---

### 9. Unanswered queries no se guardaban en Supabase

**Causa 1**: La tabla `unanswered_queries` no estaba en el tipo `Database` en `lib/supabase.ts`. El cliente tipado de Supabase rechazaba `.from("unanswered_queries")` antes de hacer la llamada.

**Causa 2**: El trigger original era `allLowConfidence` (todos los chunks < 0.5). Pero consultas como "¿cuándo sale 30X a la bolsa?" devolvían sim=0.522 — por encima del threshold — así que nunca disparaba.

**Causa 3**: El fallback de `context.length === 0` tampoco disparaba porque siempre hay *algo* de contexto retornado (chunks pasan el filtro de 0.2).

**Solución**:
1. Añadir `unanswered_queries` al tipo `Database` en `lib/supabase.ts`
2. Interceptar el stream con `TransformStream` — leer la respuesta completa del modelo, y si contiene `"no encontré"`, hacer el log:
```typescript
const { readable, writable } = new TransformStream({
  transform(chunk, controller) {
    fullResponse += new TextDecoder().decode(chunk);
    controller.enqueue(chunk);
  },
  flush() {
    if (fullResponse.toLowerCase().includes("no encontré")) {
      logUnanswered(query, "no_answer_in_docs");
    }
  },
});
rawStream.pipeTo(writable);
```

---

### 10. Retrieval innecesario en mensajes conversacionales

**Problema**: Cada mensaje — incluyendo "gracias", "ok", "¿qué me preguntaste?" — disparaba embed + búsqueda en Supabase. Ruido en logs, latencia innecesaria.

**Solución**: Intent check antes de retrieval. Evolución del diseño:

- **v1**: Longitud < 12 chars → demasiado agresivo, bloqueaba preguntas cortas válidas
- **v2**: Solo single word → muy conservador, dejaba pasar "ok gracias"
- **v3 final**: Tres capas:
```typescript
function isConversational(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t.includes(" ")) return true; // single word
  if (/^(gracias|ok|sí|entendido|perfecto|claro|hola|dale|sale...)/.test(t)) return true;
  if (/\b(recuerd|conversaci[oó]n|que (dijiste|dije)|anterior(es)?)\b/.test(t)) return true;
  return false;
}
```

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

- **Admin panel** con auth gate, lista de docs, upload drag & drop, re-index por doc o masivo
- **Unanswered queries tracking** — tabla en Supabase, vista en admin, botón de limpieza
- **Confidence fallback** — si todos los scores < 0.5, amplía búsqueda a topK=14
- **Markdown rendering** inline en el chat (bold, bullets, listas anidadas)
- **Parser validation** — guard de 500 chars mínimos al indexar, log de chars por chunk
- **Logging detallado** — sim scores, context_chars, skip_retrieval flag por cada request
