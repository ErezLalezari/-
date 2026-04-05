// Supabase Edge Function: Daily Parent Summary via Telegram
// Deploy: supabase functions deploy daily-email
// Schedule via cron: invoke daily at 7am
// Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_BOT_TOKEN = "8567569605:AAFjg2OPgqTNbDy1uA_n0vgue_qgkcwUMkU";
const TELEGRAM_CHAT_ID = "733310875";
const SUMMARY_URL = "https://leya-bible-quiz.vercel.app?screen=summary";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get yesterday's results
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
  const endOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString();

  const { data: results } = await supabase
    .from("quiz_results")
    .select("*")
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay);

  const { data: feedback } = await supabase
    .from("feedback")
    .select("*")
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay);

  const total = results?.length || 0;
  const correct = results?.filter((r: any) => r.correct)?.length || 0;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const fbCount = feedback?.length || 0;

  // Build topic breakdown
  const topics: Record<string, { c: number; t: number }> = {};
  results?.forEach((r: any) => {
    if (!topics[r.topic]) topics[r.topic] = { c: 0, t: 0 };
    topics[r.topic].t++;
    if (r.correct) topics[r.topic].c++;
  });

  const topicLines = Object.entries(topics)
    .map(([t, s]) => `   ${t}: ${s.c}/${s.t}`)
    .join("\n");

  const emoji = total === 0 ? "😴" : pct >= 80 ? "🌟" : pct >= 60 ? "👍" : "💪";

  let msg = `📖 סיכום יומי — לייה\n\n`;

  if (total === 0) {
    msg += `😴 אין פעילות אתמול\n`;
  } else {
    msg += `${emoji} ${total} שאלות | ${pct}% דיוק (${correct}/${total})\n`;
    if (topicLines) msg += `\n📚 לפי נושא:\n${topicLines}\n`;
  }

  if (fbCount > 0) msg += `\n💬 ${fbCount} פידבקים חדשים\n`;

  msg += `\n👉 סיכום מלא: ${SUMMARY_URL}`;

  // Send Telegram message
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || TELEGRAM_BOT_TOKEN;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || TELEGRAM_CHAT_ID;

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg,
      parse_mode: "HTML",
    }),
  });

  const tgData = await tgRes.json();

  return new Response(JSON.stringify({ sent: tgData.ok, stats: { total, correct, pct, fbCount } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
