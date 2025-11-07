import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing env.SUPABASE_URL');
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing env.SUPABASE_SERVICE_KEY');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export interface TradeParticipant {
  id?: number;
  trade_id?: number;
  user_address: string;
  side: string; // 'A' = Ask/Sell, 'B' = Bid/Buy
  start_pos: number;
  oid: number;
  twap_id: number | null;
  cloid: string | null;
  created_at?: string;
}

export interface TradeWithParticipants {
  id: number;
  coin: string;
  time: string;
  px: number;
  sz: number;
  hash: string;
  trade_dir_override: string | null;
  created_at: string;
  participants?: TradeParticipant[];
}

export type Database = {
  public: {
    Tables: {
      trades: {
        Row: {
          id: number;
          coin: string;
          time: string;
          px: number;
          sz: number;
          hash: string;
          trade_dir_override: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          coin: string;
          time: string;
          px: number;
          sz: number;
          hash: string;
          trade_dir_override?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          coin?: string;
          time?: string;
          px?: number;
          sz?: number;
          hash?: string;
          trade_dir_override?: string | null;
          created_at?: string;
        };
      };
      trade_participants: {
        Row: {
          id: number;
          trade_id: number;
          user_address: string;
          side: string;
          start_pos: number;
          oid: number;
          twap_id: number | null;
          cloid: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          trade_id: number;
          user_address: string;
          side: string;
          start_pos: number;
          oid: number;
          twap_id?: number | null;
          cloid?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          trade_id?: number;
          user_address?: string;
          side?: string;
          start_pos?: number;
          oid?: number;
          twap_id?: number | null;
          cloid?: string | null;
          created_at?: string;
        };
      };
    };
  };
};

