import { supabase } from "./supabase";
import { getProvider } from "./providers";

const CONFIDENCE_THRESHOLD = 0.5;
const FALLBACK_TOP_K = 14;
const SMALL_CORPUS_LIMIT = 50;

async function getTotalChunkCount(): Promise<number> {
  const { count, error } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

async function search(
  queryEmbedding: number[],
  topK: number
) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
  });
  if (error) throw new Error(`match_documents failed: ${error.message}`);
  return data ?? [];
}

export async function getRelevantContext(
  query: string,
  topK = 8
): Promise<string> {
  const provider = getProvider();
  const queryEmbedding = await provider.embed(query);

  let data = await search(queryEmbedding, topK);

  if (!data || data.length === 0) return "";

  // Log scores to diagnose retrieval quality
  data.forEach((r) =>
    console.log(`[retriever] ${r.filename} chunk=${r.chunk_index} sim=${r.similarity.toFixed(3)}`)
  );

  const allLowConfidence = data.every((r) => r.similarity < CONFIDENCE_THRESHOLD);

  if (allLowConfidence) {
    console.log(`[retriever] all scores below ${CONFIDENCE_THRESHOLD} — running fallback`);

    const totalChunks = await getTotalChunkCount();

    if (totalChunks <= SMALL_CORPUS_LIMIT) {
      // Small corpus: fetch a wider slice and let the model sort it out
      console.log(`[retriever] small corpus (${totalChunks} chunks) — expanding to topK=${FALLBACK_TOP_K}`);
      data = await search(queryEmbedding, FALLBACK_TOP_K);
      data.forEach((r) =>
        console.log(`[retriever] fallback: ${r.filename} chunk=${r.chunk_index} sim=${r.similarity.toFixed(3)}`)
      );
    } else {
      // TODO: SCALING BOUNDARY — corpus exceeded SMALL_CORPUS_LIMIT chunks.
      // Instead of fetching all chunks, re-embed a rephrased version of the query:
      // 1. Call provider.chat() with a short prompt asking it to rephrase the query
      //    in 2-3 alternative ways that might match the embedding space better.
      // 2. Embed each rephrased variant.
      // 3. Run match_documents for each, merge results, deduplicate by chunk id,
      //    re-rank by max similarity score, take topK.
      // This avoids loading the full corpus into memory while recovering from
      // low-similarity queries at scale.
      console.log(`[retriever] large corpus (${totalChunks} chunks) — skipping fallback (TODO: query rephrasing)`);
    }
  }

  const relevant = data.filter((r) => r.similarity >= 0.2);
  if (relevant.length === 0) return "";

  return relevant
    .map((row) => `--- Chunk from ${row.filename} ---\n${row.content}`)
    .join("\n\n");
}
