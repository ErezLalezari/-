#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mibqnkhvbgoavwamhmnp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA"
);

const DIFFICULTY = {school:1, district:2, national:3, world:4};
const PARSED_DIR = path.join(__dirname, "parsed_v2");

async function main() {
  const files = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith(".json"));
  let imported=0, skipped=0;
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, file), "utf8"));
    if (!data.questions || !data.questions.length) continue;
    const rows = data.questions
      .filter(q => q.q && q.q.length > 5)
      .map(q => ({
        year: data.year, stage: data.stage, sector: data.sector,
        q_number: q.n || 0,
        question: q.q,
        options: q.options || [],
        answer_letter: q.answer_letter || null,
        answer_text: q.answer_text || null,
        source: q.source || null,
        book: null,
        question_type: "multiple",
        difficulty: DIFFICULTY[data.stage] || 2,
      }));
    const { error } = await supabase.from("official_questions").upsert(rows, { onConflict:"year,stage,sector,q_number" });
    if (error) {
      console.log(`✗ ${file}: ${error.message}`);
      skipped += rows.length;
    } else {
      console.log(`✓ ${file}: ${rows.length} rows`);
      imported += rows.length;
    }
  }
  console.log(`\nImported: ${imported}, Skipped: ${skipped}`);
}
main().catch(console.error);
