// Returns the PUBLIC Supabase config to the browser. The anon/publishable key is
// designed to be public (Row Level Security protects the data) — so this is safe
// to expose. If the env vars aren't set, the app runs in local-only mode.
export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  });
}
