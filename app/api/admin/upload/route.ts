import { NextRequest, NextResponse } from "next/server";
import { indexBuffer } from "@/lib/indexer";
import { supabase, getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "documents";

function isAuthed(req: NextRequest): boolean {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

// POST — upload PDF to Supabase Storage, then index it
export async function POST(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to Supabase Storage (upsert so re-upload works)
  const { error: uploadError } = await getSupabaseAdmin().storage
    .from(BUCKET)
    .upload(file.name, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 });

  try {
    const { filename, totalChunks } = await indexBuffer(buffer, file.name);
    return NextResponse.json({ success: true, filename, chunks: totalChunks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload] indexBuffer failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET — list distinct filenames + chunk counts
export async function GET(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("documents")
    .select("*");

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

// DELETE — remove all chunks from Supabase + delete file from Storage
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename } = (await req.json()) as { filename?: string };
  if (!filename)
    return NextResponse.json({ error: "filename required" }, { status: 400 });

  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("filename", filename);

  if (dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Remove from Storage (ignore error if file doesn't exist there)
  await getSupabaseAdmin().storage.from(BUCKET).remove([filename]);

  return NextResponse.json({ success: true });
}

// PATCH — re-index an existing file already in Supabase Storage
export async function PATCH(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename } = (await req.json()) as { filename?: string };
  if (!filename)
    return NextResponse.json({ error: "filename required" }, { status: 400 });

  // Download from Storage
  const { data, error: downloadError } = await getSupabaseAdmin().storage
    .from(BUCKET)
    .download(filename);

  if (downloadError || !data)
    return NextResponse.json(
      { error: downloadError?.message ?? "File not found in storage" },
      { status: 404 }
    );

  const buffer = Buffer.from(await data.arrayBuffer());
  const { totalChunks } = await indexBuffer(buffer, filename);
  return NextResponse.json({ success: true, filename, chunks: totalChunks });
}
