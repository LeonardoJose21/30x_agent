import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { get_encoding } from "tiktoken";
import { supabase } from "./supabase";
import { getProvider } from "./providers";

const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;

function chunkText(text: string): string[] {
  const enc = get_encoding("cl100k_base");
  const tokens = enc.encode(text);
  const chunks: string[] = [];
  const decoder = new TextDecoder();

  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + CHUNK_TOKENS, tokens.length);
    chunks.push(decoder.decode(enc.decode(tokens.slice(start, end))));
    if (end === tokens.length) break;
    start += CHUNK_TOKENS - OVERLAP_TOKENS;
  }

  enc.free();
  return chunks;
}

export async function indexPDF(
  filePath: string
): Promise<{ filename: string; totalChunks: number }> {
  const filename = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  const chunks = chunkText(text);

  const provider = getProvider();
  const embeddings = await Promise.all(chunks.map((chunk) => provider.embed(chunk)));

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("filename", filename);
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const rows = chunks.map((content, i) => ({
    filename,
    chunk_index: i,
    content,
    embedding: embeddings[i],
  }));

  const { error: insertError } = await supabase.from("documents").insert(rows);
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  return { filename, totalChunks: chunks.length };
}
