#!/usr/bin/env node
// Use Gemini AI to detect book for questions without book field
const { createClient } = require("@supabase/supabase-js");

const PROXY = "https://mibqnkhvbgoavwamhmnp.supabase.co/functions/v1/ai-proxy";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA";

const supabase = createClient("https://mibqnkhvbgoavwamhmnp.supabase.co", ANON);

const VALID_BOOKS = ["bereshit","shemot","vayikra","bamidbar","devarim","yehoshua","shoftim","shmuel_a","shmuel_b","melachim_a","melachim_b","yeshayahu","yirmiyahu","yechezkel","hoshea","yoel","amos","ovadia","yona","micha","nachum","chavakuk","tzefania","chagai","zechariah","malachi","tehilim","mishlei","iyov","shir","rut","eicha","kohelet","esther","daniel","ezra","nechemya","divrei_a","divrei_b"];

async function detectBook(question, options, answer) {
  const prompt = `על איזה ספר בתנ"ך השאלה הזו?
שאלה: "${question}"
${options&&options.length?`אפשרויות: ${options.join(' / ')}`:''}
${answer?`תשובה: ${answer}`:''}

החזר רק את שם הספר באנגלית (אחת מהרשימה):
${VALID_BOOKS.join(", ")}

דוגמאות:
- "מה שם אחיו של אברהם?" → bereshit
- "מי הצילה את משה?" → shemot
- "כמה שנים מלך דוד?" → shmuel_b
- "מי בנה את המקדש?" → melachim_a

החזר מילה אחת בלבד, באנגלית, ללא הסבר.`;

  try {
    const res = await fetch(PROXY, {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${ANON}`},
      body:JSON.stringify({prompt, maxTokens:200})
    });
    const data = await res.json();
    const text = (data.text||"").trim().toLowerCase().replace(/[^a-z_]/g,"");
    if (VALID_BOOKS.includes(text)) return text;
    // Maybe contains the book name
    for (const b of VALID_BOOKS) {
      if (text.includes(b)) return b;
    }
    return null;
  } catch(e) {
    console.error("  AI error:", e.message);
    return null;
  }
}

async function main() {
  const {data:items} = await supabase
    .from("official_questions")
    .select("id,question,options,answer_text,source")
    .is("book", null)
    .limit(500);

  console.log(`Found ${items?.length||0} questions without book`);
  if (!items || !items.length) return;

  let detected = 0, failed = 0;
  console.log("Starting...");
  for (const q of items) {
    const book = await detectBook(q.question, q.options, q.answer_text);
    if (book) {
      const {error} = await supabase.from("official_questions").update({book}).eq("id", q.id);
      if (error) { console.error(`Q${q.id}: db error ${error.message}`); failed++; }
      else { detected++; if(detected%10===0) console.log(`Progress: ${detected}/${items.length} detected`); }
    } else {
      failed++;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`\nDone! Detected: ${detected}, Failed: ${failed}`);
}

main().catch(console.error);
