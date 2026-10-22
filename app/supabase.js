// The one Supabase client for the whole app.
// Reads the project URL and publishable key from window.RIVAL_CONFIG (app/config.js, generated from env).
// If config or the library is missing, window.rivalDb is null and the app keeps working on this phone only.
// Never put the Supabase secret / service_role key in front-end code: Row Level Security is what protects the data.
(function () {
  var c = window.RIVAL_CONFIG || {};
  var ok = c.supabaseUrl && c.supabaseKey && window.supabase && typeof window.supabase.createClient === 'function';
  window.rivalDb = ok ? window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'rival.auth' }
  }) : null;
})();
