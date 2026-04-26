#!/usr/bin/env node
// Strip Hebrew niqud from existing official_questions in the database
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mibqnkhvbgoavwamhmnp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA"
);

const NIQUD_RE = /[֑-ׇֽֿׁׂׅׄ]/g;

function clean(s) {
  if (!s || typeof s !== "string") return s;
  return s.replace(NIQUD_RE, "").replace(/\s+/g, " ").trim();
}

async function main() {
  let offset = 0;
  let updated = 0;
  while (true) {
    const { data } = await supabase
      .from("official_questions")
      .select("id,question,options,answer_text")
      .range(offset, offset + 99);
    if (!data || !data.length) break;
    for (const q of data) {
      const newQ = clean(q.question);
      const newOpts = Array.isArray(q.options) ? q.options.map(clean) : q.options;
      const newAns = clean(q.answer_text);
      if (newQ !== q.question || JSON.stringify(newOpts) !== JSON.stringify(q.options) || newAns !== q.answer_text) {
        const { error } = await supabase
          .from("official_questions")
          .update({ question: newQ, options: newOpts, answer_text: newAns })
          .eq("id", q.id);
        if (!error) updated++;
      }
    }
    offset += 100;
    console.log(`Processed ${offset}, updated ${updated} so far`);
  }
  console.log(`\nDone. Updated ${updated} questions.`);
}

main().catch(console.error);
