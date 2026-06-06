import fs from "fs";
import path from "path";
import { get_encoding } from "tiktoken";
import { getSupabaseAdmin } from "./supabase";
import { getProvider } from "./providers";

const CHUNK_TOKENS = 256;
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

// Shared indexing logic that operates on a Buffer directly (no disk access needed)
async function indexFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ filename: string; totalChunks: number }> {
  const pdfParse = await import("pdf-parse/lib/pdf-parse.js");
  const { text } = await pdfParse.default(buffer);
  console.log(`[indexer] ${filename} raw_chars=${text.length}`);
  if (text.length < 500) {
    throw new Error(
      `[indexer] PDF extraction failed or returned garbage for "${filename}" (only ${text.length} chars). Check if the PDF is scanned/image-based.`
    );
  }
  const chunks = chunkText(text);
  console.log(`[indexer] ${filename} chunks=${chunks.length}`);
  chunks.forEach((c, i) =>
    console.log(`[indexer]   chunk[${i}] chars=${c.length}`)
  );

  const provider = getProvider();
  const embeddings = await Promise.all(chunks.map((chunk) => provider.embed(chunk)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseAdmin() as any;

  const { error: deleteError } = await db
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

  const { error: insertError } = await db.from("documents").insert(rows);
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  return { filename, totalChunks: chunks.length };
}

// Index from a Buffer — used by the upload route (no disk I/O needed)
export async function indexBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ filename: string; totalChunks: number }> {
  return indexFromBuffer(buffer, filename);
}

// Index from a file path — used by the CLI script (scripts/index-docs.ts)
export async function indexPDF(
  filePath: string
): Promise<{ filename: string; totalChunks: number }> {
  const filename = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  return indexFromBuffer(buffer, filename);
}
