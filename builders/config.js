/* =====================================================================
   Builders — connection settings
   ---------------------------------------------------------------------
   Both values come from your Supabase project:
     Project Settings -> API -> Project URL / anon public key

   The anon key is SAFE to publish. It is designed to sit in browser
   code; on its own it can do nothing. What a signed-in Builder may read
   or write is decided by the row-level security policies in README.md,
   which run on Supabase's servers, not in this file.

   Never put the service_role key here. That one bypasses every policy.

   Leave both empty and the Builders pages say they are not connected
   yet, instead of pretending to work.

   The Dead Hand case board (htr/brooklyn/dead-hand/rico-case/) reads
   these two values as well, to save its case files online.
   ===================================================================== */
window.BUILDERS_CONFIG = {
  supabaseUrl: "https://yodxdjdhdtadvuhroftu.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZHhkamRoZHRhZHZ1aHJvZnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzQxNjYsImV4cCI6MjEwNjMxMDE2Nn0.ZB9PQ0nWv_ZWOrYNJswYDMjtbpVIHvk3rSRMv3EtWV8",

  // Storage bucket for uploads. Must match the bucket in README.md.
  bucket: "builder-uploads",

  // Largest single upload, in megabytes. Set the same limit on the
  // bucket in Supabase so it is enforced server-side too.
  maxUploadMb: 25
};
