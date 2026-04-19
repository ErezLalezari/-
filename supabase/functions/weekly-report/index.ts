// Weekly Behavior Report — runs every Friday 18:00 Israel time
// Focuses on behavior/progress, not just scores
// Deploy: supabase functions deploy weekly-report

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = "8567569605:AAFjg2OPgqTNbDy1uA_n0vgue_qgkcwUMkU";
const TELEGRAM_CHAT_ID = "733310875";

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
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Last 7 days
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: results } = await supabase
    .from("quiz_results")
    .select("*")
    .gte("created_at", weekAgo.toISOString());

  const { data: feedback } = await supabase
    .from("feedback")
    .select("text, created_at")
    .gte("created_at", weekAgo.toISOString());

  const total = results?.length || 0;
  const correct = results?.filter((r: any) => r.correct).length || 0;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Days active
  const dates = new Set(results?.map((r: any) => r.created_at.slice(0, 10)));
  const activeDays = dates.size;

  // Topics touched
  const topics: Record<string, { c: number; t: number }> = {};
  results?.forEach((r: any) => {
    if (!topics[r.topic]) topics[r.topic] = { c: 0, t: 0 };
    topics[r.topic].t++;
    if (r.correct) topics[r.topic].c++;
  });

  const topicNames: Record<string, string> = {
    bereshit: "בראשית", shemot: "שמות", bamidbar: "במדבר", devarim: "דברים",
    yehoshua: "יהושע", shoftim: "שופטים", yona: "יונה", rut: "רות",
    esther: "אסתר", shmuel: "שמואל", melachim_a: "מלכים א", melachim_b: "מלכים ב",
    yirmiyahu: "ירמיהו", daniel: "דניאל", mixed: "מעורב", daily: "אתגר יומי",
  };

  // Strong topics (>=75%)
  const strongTopics = Object.entries(topics)
    .filter(([_, s]) => s.t >= 2 && s.c / s.t >= 0.75)
    .map(([id, s]) => `${topicNames[id] || id} (${s.c}/${s.t})`);

  // Weak topics (<50%)
  const weakTopics = Object.entries(topics)
    .filter(([_, s]) => s.t >= 2 && s.c / s.t < 0.5)
    .map(([id, s]) => `${topicNames[id] || id} (${s.c}/${s.t})`);

  // Fastest day
  const dayStats: Record<string, { c: number; t: number }> = {};
  results?.forEach((r: any) => {
    const d = r.created_at.slice(0, 10);
    if (!dayStats[d]) dayStats[d] = { c: 0, t: 0 };
    dayStats[d].t++;
    if (r.correct) dayStats[d].c++;
  });
  const peakDay = Object.entries(dayStats).sort((a, b) => b[1].t - a[1].t)[0];

  // Build behavior-focused message
  const dateRange = `${weekAgo.toLocaleDateString("he-IL", { day: "numeric", month: "short" })} – ${now.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`;

  let msg = `📊 סיכום שבועי — לייה\n📅 ${dateRange}\n\n`;

  // Behavior section (most important)
  if (activeDays === 0) {
    msg += `⚠️ *לא פעילה השבוע*\n`;
    msg += `לייה לא נכנסה לאפליקציה אף פעם.\n`;
    msg += `מומלץ לבדוק איתה מה קורה.\n\n`;
  } else if (activeDays <= 2) {
    msg += `⚠️ פעילות נמוכה: ${activeDays}/7 ימים\n`;
    msg += `הרצף שבור. כדאי לדבר איתה על המוטיבציה.\n\n`;
  } else if (activeDays >= 5) {
    msg += `🔥 פעילות מצוינת: ${activeDays}/7 ימים!\n`;
    msg += `המוטיבציה שלה גבוהה. שמרו על זה.\n\n`;
  } else {
    msg += `📅 פעילות: ${activeDays}/7 ימים\n\n`;
  }

  if (total > 0) {
    msg += `🎯 ${total} שאלות · ${pct}% דיוק\n`;
    if (peakDay) {
      const [peakDate, peakS] = peakDay;
      const dayName = new Date(peakDate).toLocaleDateString("he-IL", { weekday: "long" });
      msg += `🏆 יום שיא: ${dayName} (${peakS.t} שאלות)\n`;
    }
    msg += `\n`;

    if (strongTopics.length > 0) {
      msg += `⭐ חזקה ב:\n${strongTopics.slice(0, 4).map(t => `• ${t}`).join("\n")}\n\n`;
    }

    if (weakTopics.length > 0) {
      msg += `🔴 צריכה חיזוק ב:\n${weakTopics.slice(0, 3).map(t => `• ${t}`).join("\n")}\n\n`;
    }
  }

  if (feedback && feedback.length > 0) {
    msg += `💬 פידבקים השבוע: ${feedback.length}\n\n`;
  }

  // Shabbat discussion prompt
  msg += `🕯️ לשיחת שבת:\n`;
  const prompts = [
    "מה הכי אהבת ללמוד השבוע?",
    "איזה סיפור בתנ\"ך הכי דיבר אליך?",
    "מה היית רוצה שנלמד יחד השבוע הבא?",
  ];
  msg += `"${prompts[Math.floor(Math.random() * prompts.length)]}"\n\n`;

  msg += `👉 סיכום מלא: https://leya-bible-quiz.vercel.app?screen=summary`;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg }),
  });

  return new Response(JSON.stringify({ sent: true, activeDays, total, pct }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
