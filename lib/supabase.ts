import { createClient } from '@supabase/supabase-js';

export type Document = {
  id: string;
  filename: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  created_at: string;
};

export type MatchResult = {
  id: string;
  filename: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

export type UnansweredQuery = {
  id: string;
  query: string;
  escalation_target: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: Document;
        Insert: Omit<Document, 'id' | 'created_at'>;
        Update: Partial<Omit<Document, 'id' | 'created_at'>>;
      };
      unanswered_queries: {
        Row: UnansweredQuery;
        Insert: Omit<UnansweredQuery, 'id' | 'created_at'>;
        Update: Partial<Omit<UnansweredQuery, 'id' | 'created_at'>>;
      };
    };
    Functions: {
      match_documents: {
        Args: { query_embedding: number[]; match_count?: number };
        Returns: MatchResult[];
      };
    };
  };
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — service role key, bypasses RLS. Use only in server-side API routes.
// Lazy so that missing env var doesn't crash at build time.
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    _supabaseAdmin = createClient(supabaseUrl, key);
  }
  return _supabaseAdmin;
}
