#!/usr/bin/env node
/**
 * Style-based question generator:
 * Uses real official questions as few-shot examples for Gemini.
 * Generates new questions in the same style for books that need more coverage.
 */
const { createClient } = require("@supabase/supabase-js");

const PROXY = "https://mibqnkhvbgoavwamhmnp.supabase.co/functions/v1/ai-proxy";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA";

const supabase = createClient("https://mibqnkhvbgoavwamhmnp.supabase.co", ANON);

const BOOKS_PRIORITY = [
  "bereshit","shemot","bamidbar","devarim","yehoshua","shoftim",
  "shmuel_a","shmuel_b","melachim_a","melachim_b","yona","rut","esther"
];

const BOOK_NAMES = {
  bereshit:"בראשית",shemot:"שמות",bamidbar:"במדבר",devarim:"דברים",
  yehoshua:"יהושע",shoftim:"שופטים",shmuel_a:"שמואל א",shmuel_b:"שמואל ב",
  melachim_a:"מלכים א",melachim_b:"מלכים ב",yona:"יונה",rut:"רות",
  esther:"אסתר",daniel:"דניאל",nechemya:"נחמיה",ezra:"עזרא",yirmiyahu:"ירמיהו"
};

async function callAI(prompt, maxTokens=4000) {
  const res = await fetch(PROXY, {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${ANON}`},
    body:JSON.stringify({prompt, maxTokens})
  });
  const data = await res.json();
  return data.text || "";
}

async function getExamples(book, limit=5) {
  const { data } = await supabase.from("official_questions")
    .select("question,options,answer_text,source")
    .eq("book", book)
    .not("answer_text","is",null)
    .limit(limit);
  return data || [];
}

async function generateForBook(book, count=10, batch=0) {
  const examples = await getExamples(book, 5);
  const examplesStr = examples.map((e,i) => `דוגמה ${i+1}:
שאלה: ${e.question}
אפשרויות: ${(e.options||[]).map((o,j)=>`${"אבגד"[j]}. ${o}`).join(" | ")}
תשובה נכונה: ${e.answer_text}
${e.source?`מקור: ${e.source}`:""}`).join("\n\n");

  const prompt = `הינה דוגמאות לשאלות מחידון התנ"ך הרשמי על ספר ${BOOK_NAMES[book]}:

${examplesStr}

עכשיו, צור ${count} שאלות חדשות באותו סגנון בדיוק:
- אותו רמת קושי (ילדה בת 10-12)
- אותה מבנה: שאלה ברורה + 4 אפשרויות
- מקורות מספר ${BOOK_NAMES[book]} בלבד
- אל תחזור על שאלות מהדוגמאות
- שאלות מגוונות: דמויות, אירועים, ציטוטים, מקומות, מספרים

החזר JSON בלבד - מערך:
[{"q":"השאלה","options":["א","ב","ג","ד"],"answer_text":"התשובה","source":"בראשית X, Y"}]

ללא טקסט נוסף לפני או אחרי.`;

  const raw = await callAI(prompt, 6000);
  const cleaned = raw.replace(/```json/g,"").replace(/```/g,"").trim();
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (!arr) return [];
  try {
    const parsed = JSON.parse(arr[0]);
    // Use book-specific year to avoid q_number collisions across books
    const bookYear = 9000 + BOOKS_PRIORITY.indexOf(book); // 9000-9012 per book
    return parsed.map((q,i) => ({
      year: bookYear,
      stage: "ai-generated",
      sector: "mixed",
      q_number: batch * 100 + i,
      question: q.q,
      options: q.options || [],
      answer_letter: null,
      answer_text: q.answer_text,
      source: q.source || null,
      book,
      question_type: "multiple",
      difficulty: 2,
    }));
  } catch(e) {
    console.error("  Parse error:", e.message);
    return [];
  }
}

async function main() {
  let total = 0;
  for (const book of BOOKS_PRIORITY) {
    console.log(`\n=== ${BOOK_NAMES[book]} (${book}) ===`);
    let added = 0;
    for (let batch = 0; batch < 3; batch++) {
      console.log(`  Batch ${batch+1}/3...`);
      const questions = await generateForBook(book, 8, batch);
      if (questions.length === 0) {
        console.log("    No questions generated");
        continue;
      }
      const { error } = await supabase.from("official_questions").upsert(questions, { onConflict:"year,stage,sector,q_number" });
      if (error) {
        console.log(`    ✗ ${error.message}`);
      } else {
        added += questions.length;
        console.log(`    ✓ ${questions.length} questions`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    total += added;
    console.log(`  Total for ${BOOK_NAMES[book]}: ${added}`);
  }
  console.log(`\n=== Done! Generated ${total} new style-based questions ===`);
}

main().catch(console.error);
