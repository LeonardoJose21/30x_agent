import fs from "fs";
import path from "path";
import { get_encoding } from "tiktoken";
import { supabase } from "./supabase";
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

export async function indexPDF(
  filePath: string
): Promise<{ filename: string; totalChunks: number }> {
  const filename = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  // Import the lib directly — pdf-parse/index.js runs a fs.readFileSync at module
  // load time (require.main check) which breaks under Next.js's bundler.
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
