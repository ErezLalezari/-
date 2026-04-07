#!/usr/bin/env node
const GEMINI_KEY = "AIzaSyB9DU0apcLh6aO8WeZlkQ00PtDAJfFLYxE";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

const TOPICS = [
  {id:"bereshit",name:"בראשית"},{id:"shemot",name:"שמות"},{id:"bamidbar",name:"במדבר"},
  {id:"devarim",name:"דברים"},{id:"yehoshua",name:"יהושע"},{id:"shoftim",name:"שופטים"},
  {id:"yona",name:"יונה"},{id:"rut",name:"רות"},{id:"esther",name:"אסתר"},
  {id:"shmuel",name:"שמואל"},{id:"melachim_a",name:"מלכים א"},{id:"melachim_b",name:"מלכים ב"},
  {id:"yirmiyahu",name:"ירמיהו"},{id:"chagai",name:"חגי"},{id:"daniel",name:"דניאל"},
  {id:"ezra",name:"עזרא"},{id:"nechemya",name:"נחמיה"},
];

const prefix = process.argv[2] || "gx";
const BATCH_SIZE = 10; // questions per API call
const CALLS_PER_TOPIC = parseInt(process.argv[3] || "3"); // 3 calls × 10 = 30 per topic

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {maxOutputTokens: 4096, temperature: 0.85}
    })
  });
  const d = await res.json();
  if (d.error) { console.error("  API error:", d.error.message); return []; }
  const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  try {
    // Remove markdown code fences and any thinking tags
    let clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    clean = clean.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // Extract JSON array
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]);
    return JSON.parse(clean);
  } catch(e) {
    console.error("  Parse error, raw length:", raw.length, e.message?.slice(0,50));
    return [];
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const all = {};
  let total = 0;

  for (const topic of TOPICS) {
    all[topic.id] = [];
    for (let call = 0; call < CALLS_PER_TOPIC; call++) {
      const focus = ["דמויות ואירועים מרכזיים", "מקומות, מספרים וציטוטים", "לקחים מוסריים וקשרים בין סיפורים"][call % 3];
      const prompt = `צור בדיוק ${BATCH_SIZE} שאלות חידון על ספר ${topic.name} בתנ"ך. לילדה בת 10.
התמקד ב: ${focus}
החזר מערך JSON בלבד, ללא טקסט נוסף:
[{"id":"${prefix}${topic.id.slice(0,2)}${call}01","type":"multiple","q":"שאלה","a":"תשובה","o":["א","ב","ג","ד"],"hint":"רמז","exp":"הסבר"}]
חובה: התשובה ב-a חייבת להופיע ב-o. כל התוכן בעברית.`;

      process.stdout.write(`  ${topic.name} [${call+1}/${CALLS_PER_TOPIC}]...`);
      const questions = await callGemini(prompt);
      const fixed = questions.map((q, i) => ({
        ...q,
        id: `${prefix}_${topic.id.slice(0,3)}${call}_${String(i+1).padStart(2,"0")}`,
        type: q.type || "multiple"
      }));
      all[topic.id].push(...fixed);
      total += fixed.length;
      console.log(` ${fixed.length}q`);
      await sleep(1200);
    }
    console.log(`✓ ${topic.name}: ${all[topic.id].length} total`);
  }

  require("fs").writeFileSync(`scripts/questions_${prefix}.json`, JSON.stringify(all, null, 2));
  console.log(`\nDone! ${total} questions → scripts/questions_${prefix}.json`);
}

main();
