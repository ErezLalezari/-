// Supabase Edge Function: Daily Telegram Reminder
// Schedule at 19:00 Israel time — nudge if Leya hasn't practiced today
// Deploy: supabase functions deploy daily-reminder

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = "8567569605:AAFjg2OPgqTNbDy1uA_n0vgue_qgkcwUMkU";
const TELEGRAM_CHAT_ID = "733310875";

const MESSAGES = [
  "📖 לייה, עוד לא תרגלת היום! 5 דקות של חידון תנ\"ך מחכות לך 🌟",
  "🔥 לייה! הרצף שלך בסכנה! בואי תענו על שאלה אחת לפחות 💪",
  "✨ לייה, המוח שלך רוצה ללמוד! בואי נתרגל קצת תנ\"ך 📚",
  "🌟 לייה יקרה, יש אתגר יומי שמחכה לך! קדימה 🚀",
  "📅 עוד יום בלי תרגול? לייה, בואי נשמור על הרצף! 🔥",
  "🧠 5 דקות = 5 שאלות = מוח חזק יותר! מחכים לך לייה 💡",
  "👑 מלכות ידע דורשת אימון יומי! בואי לייה, עוד כמה שאלות 📖",
  "🌈 לייה, סיפורי התנ\"ך מחכים! בואי נגלה עוד קצת 🗺️",
  "⚡ רגע קטן של לימוד = צעד גדול קדימה! יאללה לייה 🎯",
  "🎓 לייה, התנ\"ך לא ילמד את עצמו! 5 דקות ואת כוכבת 🌟",
];

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if there are quiz results from today
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const { data: results } = await supabase
    .from("quiz_results")
    .select("id")
    .gte("created_at", todayStart)
    .limit(1);

  if (results && results.length > 0) {
    return new Response(JSON.stringify({ sent: false, reason: "already practiced today" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pick random message
  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  const fullMsg = `${msg}\n\n👉 https://leya-bible-quiz.vercel.app`;

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || TELEGRAM_BOT_TOKEN;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || TELEGRAM_CHAT_ID;

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: fullMsg }),
  });

  const tgData = await tgRes.json();
  return new Response(JSON.stringify({ sent: tgData.ok, message: msg }), {
    headers: { "Content-Type": "application/json" },
  });
});
