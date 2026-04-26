#!/usr/bin/env node
// Import all parsed_ai/*.json files into Supabase official_questions table
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mibqnkhvbgoavwamhmnp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA"
);

// Difficulty mapping by stage
const DIFFICULTY = {
  school: 1,    // beit-sifri = easiest
  district: 2,  // mehozi = medium
  national: 3,  // artzi = hard
  world: 4,     // olami = hardest
};

const PARSED_DIR = path.join(__dirname, "parsed_ai");

async function main() {
  const files = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith(".json"));
  console.log(`Found ${files.length} parsed files`);

  let totalRows = 0;
  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(PARSED_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!data.questions || data.questions.length === 0) continue;

    const rows = data.questions
      .filter(q => q.q && q.q.length > 5)
      .map(q => ({
        year: data.year,
        stage: data.stage,
        sector: data.sector,
        q_number: q.n || 0,
        question: q.q,
        options: q.options || [],
        answer_letter: q.answer_letter || null,
        answer_text: q.answer_text || null,
        source: q.source || null,
        book: q.book || null,
        question_type: q.options && q.options.length > 0 ? "multiple" : "open",
        difficulty: DIFFICULTY[data.stage] || 2,
      }));

    totalRows += rows.length;

    // Use upsert with ON CONFLICT
    const { data: result, error } = await supabase
      .from("official_questions")
      .upsert(rows, { onConflict: "year,stage,sector,q_number", ignoreDuplicates: false });

    if (error) {
      console.log(`✗ ${file}: ${error.message}`);
      totalSkipped += rows.length;
    } else {
      console.log(`✓ ${file}: ${rows.length} rows`);
      totalImported += rows.length;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Files processed: ${files.length}`);
  console.log(`Total rows: ${totalRows}`);
  console.log(`Imported: ${totalImported}`);
  console.log(`Failed/skipped: ${totalSkipped}`);
}

main().catch(console.error);
