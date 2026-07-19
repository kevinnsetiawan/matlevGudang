// Supabase client + helper email auth — dipindah dari App.jsx (refactor Fase 1).
// Satu client dipakai untuk auth (login/sesi/logout) maupun REST sync
// (tug15_history, stock_current, dst). SUPABASE_URL/SUPABASE_KEY diekspor
// karena fungsi sync di App.jsx memakainya langsung untuk fetch REST.
import { createClient } from "@supabase/supabase-js";

// Test harness is DEV-only and must remain physically unable to construct a
// production Supabase client, even when the developer has .env.local secrets.
const E2E_MODE = import.meta.env.DEV && (import.meta.env.MODE === "e2e" || import.meta.env.VITE_E2E === "true");
export const SUPABASE_URL = E2E_MODE ? undefined : import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = E2E_MODE ? undefined : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Supabase Auth butuh format email; akun PLN login pakai username pendek,
// jadi kita tempelkan domain sintetis di belakangnya.
const AUTH_EMAIL_DOMAIN = "@warnoto.pln.local";
export function usernameToAuthEmail(username) { return `${(username||"").trim().toLowerCase()}${AUTH_EMAIL_DOMAIN}`; }
