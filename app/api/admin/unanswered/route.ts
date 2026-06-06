import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function isAuthed(req: NextRequest): boolean {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

type Row = { query: string; escalation_target: string };

// GET — return queries grouped by text, sorted by frequency desc
export async function GET(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("unanswered_queries")
    .select("query, escalation_target")
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by query text, count occurrences, keep most recent escalation_target
  const map = new Map<string, { count: number; escalation_target: string }>();
  for (const row of (data ?? []) as Row[]) {
    const existing = map.get(row.query);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(row.query, { count: 1, escalation_target: row.escalation_target });
    }
  }

  const queries = Array.from(map.entries())
    .map(([query, { count, escalation_target }]) => ({ query, count, escalation_target }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ queries });
}

// DELETE — clear all rows
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("unanswered_queries")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
