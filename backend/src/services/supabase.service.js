const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("[supabase.service] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / ANON_KEY in environment");
}

const { supabaseAdmin } = require("../config/supabaseAdmin");

module.exports = {
  supabase,
  supabaseAdmin,
};
