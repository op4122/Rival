// delete-account: permanently deletes the signed-in user's data and their login.
// Called by the app from Settings → Delete account with the user's login token (JWT).
// The service role key (full database access) comes from Supabase's own environment; it is never sent to the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://op4122.github.io', 'http://localhost:8765', 'http://127.0.0.1:8765'];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function reply(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'method_not_allowed' });

  // 1. Who is asking? Check the login token with Supabase Auth. A missing, expired or forged token stops here.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(req, 401, { error: 'not_signed_in' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return reply(req, 401, { error: 'not_signed_in' });
  const uid = user.id;

  // 2. Delete this user's rows, children first (logged sets point at workouts and custom exercises).
  //    Every query is filtered to this one user id. Built-in exercises (user_id null) are never touched.
  const steps: [string, string][] = [
    ['workout_sets', 'user_id'],
    ['workouts', 'user_id'],
    ['readiness_checkins', 'user_id'],
    ['exercises', 'user_id'],
    ['profiles', 'id'],
  ];
  for (const [table, column] of steps) {
    const { error } = await admin.from(table).delete().eq(column, uid);
    if (error) {
      console.error('delete-account: failed on', table, error.message);
      return reply(req, 500, { error: 'delete_failed', step: table });
    }
  }

  // 3. Delete the login itself. After this the token stops working.
  const { error: userError } = await admin.auth.admin.deleteUser(uid);
  if (userError) {
    console.error('delete-account: failed to delete auth user', userError.message);
    return reply(req, 500, { error: 'delete_failed', step: 'auth_user' });
  }

  return reply(req, 200, { deleted: true });
});
