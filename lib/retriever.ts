import { supabase } from "./supabase";
import { getProvider } from "./providers";

export async function getRelevantContext(
  query: string,
  topK = 5
): Promise<string> {
  const provider = getProvider();
  const queryEmbedding = await provider.embed(query);

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
  });

  if (error) throw new Error(`match_documents failed: ${error.message}`);
  if (!data || data.length === 0) return "";

  return data
    .map((row) => `--- Chunk from ${row.filename} ---\n${row.content}`)
    .join("\n\n");
}
