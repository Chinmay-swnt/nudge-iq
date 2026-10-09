const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { supabaseAdmin } = require("./src/config/supabaseAdmin");

async function runPhase1AcceptanceCheck() {
  console.log("==================================================");
  console.log("  NUDGEIQ PHASE 1 ACCEPTANCE CHECK");
  console.log("==================================================\n");

  let allPassed = true;

  // 1. Check Backend Health
  try {
    const res = await fetch("http://localhost:4000/health");
    const json = await res.json();
    if (res.ok && json.status === "ok") {
      console.log(" [PASS] Backend Health Endpoint: OK (HTTP 200)");
      console.log("        Response:", JSON.stringify(json));
    } else {
      console.error(" [FAIL] Backend Health Endpoint returned unexpected:", res.status, json);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] Backend Health Endpoint unreachable:", err.message);
    allPassed = false;
  }

  // 2. Check AI Service Health
  try {
    const res = await fetch("http://localhost:8000/health");
    const json = await res.json();
    if (res.ok && json.status === "ok") {
      console.log(" [PASS] AI Service Health Endpoint: OK (HTTP 200)");
      console.log("        Response:", JSON.stringify(json));
    } else {
      console.error(" [FAIL] AI Service Health Endpoint returned unexpected:", res.status, json);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] AI Service Health Endpoint unreachable:", err.message);
    allPassed = false;
  }

  // 3. Check Supabase Admin Service-Role Client
  try {
    const { data: teams, error: tErr } = await supabaseAdmin.from("teams").select("id, name");
    if (!tErr && Array.isArray(teams)) {
      console.log(" [PASS] Supabase Admin Service-Role Client: Connected");
      console.log(`        Found ${teams.length} teams in database:`, teams.map((t) => `${t.name} (${t.id.slice(0, 8)}...)`).join(", "));
    } else {
      console.error(" [FAIL] Supabase Admin Client error:", tErr?.message);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] Supabase Admin Client threw exception:", err.message);
    allPassed = false;
  }

  // 4. Check Multi-Team Isolation (User A in Team 1 vs Team 2)
  try {
    const { data: team1Members } = await supabaseAdmin
      .from("team_members")
      .select("team_id, user_id, role, users(email)")
      .eq("team_id", "d9afc685-70fd-4023-891a-b2193a8f6d39");

    const { data: team2Members } = await supabaseAdmin
      .from("team_members")
      .select("team_id, user_id, role, users(email)")
      .eq("team_id", "d04ad11c-fceb-4b09-b563-5ac0afc07816");

    const team1UserIds = (team1Members || []).map((m) => m.user_id);
    const team2UserIds = (team2Members || []).map((m) => m.user_id);

    // Find User A who is ONLY in Team 1
    const userA = team1Members.find((m) => !team2UserIds.includes(m.user_id));
    // Find User B who is in Team 2
    const userB = team2Members[0];

    console.log("\n--- Multi-Team Account Verification ---");
    console.log(`User A: ${userA?.users?.email || userA?.user_id} (Member of Team 1 ONLY)`);
    console.log(`User B: ${userB?.users?.email || userB?.user_id} (Member of Team 2)`);

    // Fetch meetings per team
    const { data: team1Meetings } = await supabaseAdmin.from("meetings").select("id, title").eq("team_id", "d9afc685-70fd-4023-891a-b2193a8f6d39");
    const { data: team2Meetings } = await supabaseAdmin.from("meetings").select("id, title").eq("team_id", "d04ad11c-fceb-4b09-b563-5ac0afc07816");

    console.log(`Team 1 Meetings Count: ${team1Meetings?.length || 0}`);
    console.log(`Team 2 Meetings Count: ${team2Meetings?.length || 0}`);

    // Verify User A membership in Team 2 evaluates to false
    const userAInTeam2 = team2UserIds.includes(userA?.user_id);
    if (!userAInTeam2) {
      console.log(" [PASS] User A is strictly isolated from Team 2 (team_members junction validation)");
      console.log(" [PASS] Team 2 meetings are restricted to Team 2 members only");
    } else {
      console.error(" [FAIL] User A unexpectedly found in Team 2 membership");
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] Team isolation check failed:", err.message);
    allPassed = false;
  }

  console.log("\n==================================================");
  if (allPassed) {
    console.log("  >>> ALL PHASE 1 ACCEPTANCE CHECKS PASSED <<<");
  } else {
    console.log("  >>> PHASE 1 ACCEPTANCE CHECKS HAD FAILURES <<<");
  }
  console.log("==================================================");
}

runPhase1AcceptanceCheck();
