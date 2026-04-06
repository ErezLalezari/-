const { createClient } = require("@supabase/supabase-js");
const questions = require("./questions_batch5.json");
const supabase = createClient(
  "https://mibqnkhvbgoavwamhmnp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA"
);
async function seed() {
  let total = 0;
  for (const [topic, qs] of Object.entries(questions)) {
    const rows = qs.map(q => ({
      id: q.id, topic, type: q.type, q: q.q,
      a: q.a || null, options: q.o || null,
      accepted_answers: q.acceptedAnswers || null,
      hint: q.hint || null, exp: q.exp || null,
    }));
    const { error } = await supabase.from("questions").upsert(rows, { onConflict: "id" });
    if (error) console.error(`Error ${topic}:`, error.message);
    else { console.log(`✓ ${topic}: ${rows.length}`); total += rows.length; }
  }
  console.log(`\nDone! Seeded ${total} questions (batch 5).`);
}
seed();
