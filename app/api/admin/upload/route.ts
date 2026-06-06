import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { indexPDF } from "@/lib/indexer";
import { supabase } from "@/lib/supabase";

const DOCS_DIR = path.join(process.cwd(), "documents");

function isAuthed(req: NextRequest): boolean {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

// POST — upload PDF, save to /documents, index it
export async function POST(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  const filePath = path.join(DOCS_DIR, file.name);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

  const { filename, totalChunks } = await indexPDF(filePath);
  return NextResponse.json({ success: true, filename, chunks: totalChunks });
}

// GET — list distinct filenames + chunk counts
export async function GET(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("documents")
    .select("filename, chunk_index");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.filename] = (counts[row.filename] ?? 0) + 1;
  }

  const documents = Object.entries(counts)
    .map(([filename, chunks]) => ({ filename, chunks }))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  return NextResponse.json({ documents });
}

// DELETE — remove all chunks from Supabase + delete file from disk
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename } = (await req.json()) as { filename?: string };
  if (!filename)
    return NextResponse.json({ error: "filename required" }, { status: 400 });

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("filename", filename);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    fs.unlinkSync(path.join(DOCS_DIR, filename));
  } catch {
    // File may not exist on disk — that's fine
  }

  return NextResponse.json({ success: true });
}

// PATCH — re-index an existing file already on disk
export async function PATCH(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename } = (await req.json()) as { filename?: string };
  if (!filename)
    return NextResponse.json({ error: "filename required" }, { status: 400 });

  const filePath = path.join(DOCS_DIR, filename);
  if (!fs.existsSync(filePath))
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });

  const { totalChunks } = await indexPDF(filePath);
  return NextResponse.json({ success: true, filename, chunks: totalChunks });
}
