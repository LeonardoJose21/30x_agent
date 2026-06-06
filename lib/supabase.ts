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

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: Document;
        Insert: Omit<Document, 'id' | 'created_at'>;
        Update: Partial<Omit<Document, 'id' | 'created_at'>>;
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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
