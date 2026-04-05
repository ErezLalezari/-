// Supabase Edge Function: Daily Parent Email Summary
// Deploy: supabase functions deploy daily-email
// Schedule: supabase functions schedule daily-email --cron "0 7 * * *"
// Requires env vars: RESEND_API_KEY, PARENT_EMAIL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const parentEmail = Deno.env.get("PARENT_EMAIL") || "erez@lalezari.com";

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get yesterday's date range
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
  const endOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString();

  // Fetch feedback from last 24h
  const { data: feedback } = await supabase
    .from("feedback")
    .select("*")
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay)
    .order("created_at", { ascending: false });

  // Fetch quiz_results if table exists
  const { data: results } = await supabase
    .from("quiz_results")
    .select("*")
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay)
    .order("created_at", { ascending: false });

  const feedbackCount = feedback?.length || 0;
  const resultsCount = results?.length || 0;
  const correctCount = results?.filter((r: any) => r.correct)?.length || 0;
  const accuracy = resultsCount > 0 ? Math.round((correctCount / resultsCount) * 100) : 0;

  const dateStr = yesterday.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const feedbackList = feedback?.length
    ? feedback.map((f: any) => `<li style="margin-bottom:8px">${f.text} <span style="color:#888">(${f.screen || "כללי"})</span></li>`).join("")
    : "<li>אין פידבקים חדשים</li>";

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;direction:rtl">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
    <h1 style="color:#6C63FF;font-size:24px;margin:0 0 4px">📖 סיכום יומי — החידון של לייה</h1>
    <p style="color:#888;margin:0 0 20px;font-size:14px">${dateStr}</p>

    <div style="background:#f0f0ff;border-radius:12px;padding:16px;margin-bottom:16px">
      <h2 style="margin:0 0 8px;font-size:16px;color:#333">📊 סטטיסטיקה</h2>
      <p style="margin:4px 0;font-size:14px">שאלות שנענו: <strong>${resultsCount}</strong></p>
      <p style="margin:4px 0;font-size:14px">דיוק: <strong>${accuracy}%</strong> (${correctCount}/${resultsCount})</p>
    </div>

    ${feedbackCount > 0 ? `
    <div style="background:#fff8e1;border-radius:12px;padding:16px;margin-bottom:16px">
      <h2 style="margin:0 0 8px;font-size:16px;color:#333">💬 פידבקים חדשים (${feedbackCount})</h2>
      <ul style="margin:0;padding-right:20px;font-size:14px">${feedbackList}</ul>
    </div>` : ""}

    <p style="text-align:center;color:#aaa;font-size:12px;margin-top:20px">
      <a href="https://leya-bible-quiz.vercel.app" style="color:#6C63FF">פתח את האפליקציה</a>
    </p>
  </div>
</body>
</html>`;

  // Send email via Resend (or log if no key)
  if (resendKey) {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Leya Quiz <quiz@resend.dev>",
        to: [parentEmail],
        subject: `📖 סיכום יומי: ${resultsCount} שאלות, ${accuracy}% דיוק`,
        html,
      }),
    });

    const emailData = await emailRes.json();
    return new Response(JSON.stringify({ sent: true, email: emailData, stats: { resultsCount, accuracy, feedbackCount } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: false, reason: "no RESEND_API_KEY", html_preview: html, stats: { resultsCount, accuracy, feedbackCount } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
