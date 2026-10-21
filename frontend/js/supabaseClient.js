/**
 * CTF Arena - Supabase Client Initialization
 * File: frontend/js/supabaseClient.js
 * Rule: Supabase JS SDK is used EXCLUSIVELY for session creation/refresh and signout.
 *       All game and platform state is mediated via the Python FastAPI backend.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
