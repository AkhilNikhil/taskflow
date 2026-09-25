import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in the console instead of silently falling back to someone
  // else's Supabase project. If you see this, set VITE_SUPABASE_URL and
  // VITE_SUPABASE_ANON_KEY as build args when building the frontend image.
  console.error(
    "[TaskFlow] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
    "The app cannot authenticate until the frontend image is rebuilt with these set."
  );
}

// Purge any legacy Supabase session tokens persisted in localStorage
try {
  const legacyKeys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
      legacyKeys.push(key);
    }
  }
  legacyKeys.forEach((k) => window.localStorage.removeItem(k));
} catch {
  /* ignore storage errors */
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    storage: window.sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
