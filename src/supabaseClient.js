import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "Missing Supabase env vars. Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(url || "", anonKey || "");

// All data lives in one row of this table, under id "main":
// { jobs: [...], inventory: [...] }
export const SHOP_DATA_ROW_ID = "main";
