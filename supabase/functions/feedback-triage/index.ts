// Supabase Edge Function: Feedback Triage
// Runs hourly — classifies new feedback, notifies parent, flags bugs
// Deploy: supabase functions deploy feedback-triage

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
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch unprocessed feedback
  const { data: items } = await supabase
    .from("feedback")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true });

  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: "no new feedback" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = [];

  for (const item of items) {
    // Classify using Gemini
    let category = "other";
    let aiSummary = item.text;

    if (geminiKey) {
      try {
        const classifyPrompt = `סווג את הפידבק הבא מילדה בת 10 שמשתמשת באפליקציית חידון תנ"ך:

"${item.text}"

סווג לאחת מהקטגוריות:
- bug: באג טכני (מסך שחור, כפתור לא עובד, שגיאה)
- ux: בעיית חוויית משתמש (דברים קטנים מדי, מיקום לא נכון, ניווט לא ברור)
- feature: בקשה לפיצ'ר חדש
- content: בקשה לתוכן נוסף (שאלות, משחקים, נושאים)
- other: אחר

החזר JSON בלבד:
{"category":"bug/ux/feature/content/other","summary":"תקציר בן שורה אחת בעברית","urgency":"high/medium/low","suggested_fix":"הצעה קצרה לתיקון (אם רלוונטי)"}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: classifyPrompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
          }),
        });
        const d = await res.json();
        const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const clean = raw.replace(/```json\n?|```\n?/g, "").trim();
        const arrMatch = clean.match(/\{[\s\S]*\}/);
        if (arrMatch) {
          const parsed = JSON.parse(arrMatch[0]);
          category = parsed.category || "other";
          aiSummary = `[${parsed.urgency || "?"}] ${parsed.summary || item.text}${parsed.suggested_fix ? "\nהצעה: " + parsed.suggested_fix : ""}`;
        }
      } catch (e) {
        console.error("Classify error:", e.message);
      }
    }

    // Update feedback record
    await supabase
      .from("feedback")
      .update({ processed: true, category, ai_summary: aiSummary })
      .eq("id", item.id);

    // Build Telegram message
    const emoji = { bug: "🐛", ux: "🎨", feature: "💡", content: "📝", other: "📋" }[category] || "📋";
    const urgencyEmoji = aiSummary.includes("[high]") ? "🔴" : aiSummary.includes("[medium]") ? "🟡" : "🟢";

    let tgMsg = `${emoji} פידבק חדש מלייה\n`;
    tgMsg += `${urgencyEmoji} קטגוריה: ${category}\n\n`;
    tgMsg += `"${item.text.slice(0, 200)}"\n\n`;
    tgMsg += `📊 ${aiSummary}\n`;
    tgMsg += `🕐 ${new Date(item.created_at).toLocaleString("he-IL")}\n`;
    tgMsg += `📱 מסך: ${item.screen || "כללי"}`;

    if (category === "bug") {
      tgMsg += `\n\n⚡ סוג: באג — ייבדק אוטומטית בסשן הבא של Claude`;
    } else {
      tgMsg += `\n\n💬 ממתין לסקירה שלך`;
    }

    // Send Telegram
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: tgMsg }),
    });

    results.push({ id: item.id, category, summary: aiSummary });

    // Small delay between items
    await new Promise((r) => setTimeout(r, 500));
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
