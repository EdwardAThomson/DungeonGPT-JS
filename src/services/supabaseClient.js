import { createClient } from '@supabase/supabase-js';

// Auth client — points to the Octonion hub (central auth for all games)
const authUrl = process.env.REACT_APP_OCTONION_SUPABASE_URL;
const authKey = process.env.REACT_APP_OCTONION_SUPABASE_ANON_KEY;

let supabase = null;

if (!authUrl || !authKey) {
  console.error('Missing Octonion Supabase environment variables. Authentication will be disabled.');
} else {
  supabase = createClient(authUrl, authKey);
}

export { supabase };
