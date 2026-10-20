/**
 * CTF Arena - Frontend Runtime Configuration Example
 * Copy this file to js/config.js and insert your public Supabase URL and Anon Key.
 * Note: The anon key is safe to be exposed in the frontend client by design (RLS protected).
 * Never expose the Supabase service_role key or JWT secret on the client.
 */

export const CONFIG = {
  PLATFORM_NAME: "CTF Arena",
  API_BASE_URL: "http://localhost:8000",
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-supabase-anon-key-here",
  HEARTBEAT_INTERVAL_MS: 60000,
  POLL_INTERVAL_LEADERBOARD_MS: 15000,
  POLL_INTERVAL_ADMIN_LIVE_MS: 10000
};
