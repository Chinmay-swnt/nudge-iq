const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../backend/.env") });
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[supabaseAdmin] Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in environment.");
}

const supabaseAdmin = createClient(
  supabaseUrl || "",
  supabaseServiceKey || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = {
  supabaseAdmin,
};
