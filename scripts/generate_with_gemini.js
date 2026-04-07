#!/usr/bin/env node
// Generate Bible quiz questions using Gemini API
// Usage: node scripts/generate_with_gemini.js <batch_prefix> <count_per_topic>

const GEMINI_KEY = "AIzaSyCGqZy6gehIOVGsJhhGJwF3a6qM1rbklpo";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

const TOPICS = [
  {id:"bereshit",name:"בראשית",desc:"בריאת העולם, האבות והשבטים"},
  {id:"shemot",name:"שמות",desc:"יציאת מצרים, משה, מתן תורה"},
  {id:"bamidbar",name:"במדבר",desc:"ארבעים שנה במדבר"},
  {id:"devarim",name:"דברים",desc:"נאומי משה לפני הכניסה לארץ"},
  {id:"yehoshua",name:"יהושע",desc:"כיבוש הארץ"},
  {id:"shoftim",name:"שופטים",desc:"השופטים וגיבורי ישראל"},
  {id:"yona",name:"יונה",desc:"נביא שברח מה'"},
  {id:"rut",name:"רות",desc:"נאמנות ואהבה"},
  {id:"esther",name:"אסתר",desc:"גאולת יהודי פרס"},
  {id:"shmuel",name:"שמואל",desc:"שאול, דוד ומלכות ישראל"},
  {id:"melachim_a",name:"מלכים א",desc:"שלמה, אליהו, ממלכת ישראל"},
  {id:"melachim_b",name:"מלכים ב",desc:"אלישע, חורבן ישראל ויהודה"},
  {id:"yirmiyahu",name:"ירמיהו",desc:"נביא החורבן"},
  {id:"chagai",name:"חגי",desc:"בניית בית המקדש השני"},
  {id:"daniel",name:"דניאל",desc:"דניאל בבבל ובפרס"},
  {id:"ezra",name:"עזרא",desc:"שיבת ציון ובניית המקדש"},
  {id:"nechemya",name:"נחמיה",desc:"בניית חומת ירושלים"},
];

const prefix = process.argv[2] || "gx";
const perTopic = parseInt(process.argv[3] || "30");

async function generateForTopic(topic, count, batchPrefix) {
  const prompt = `צור בדיוק ${count} שאלות חידון תנ"ך על ספר "${topic.name}" (${topic.desc}) לילדה בת 10.

כללים:
- כל השאלות בעברית
- 90% שאלות רב-ברירתיות, 10% שאלות פתוחות
- התשובה הנכונה חייבת להופיע במערך האפשרויות
- רמזים שעוזרים בלי לגלות תשובה
- הסברים קצרים וברורים
- כסי נושאים מגוונים: דמויות, אירועים, מקומות, ציטוטים, מספרים, לקחים מוסריים

החזר JSON בלבד, ללא טקסט נוסף:
[
  {"id":"${batchPrefix}001","type":"multiple","q":"שאלה","a":"תשובה נכונה","o":["אפ1","אפ2","אפ3","אפ4"],"hint":"רמז","exp":"הסבר"},
  {"id":"${batchPrefix}002","type":"open","q":"שאלה פתוחה","acceptedAnswers":["תשובה1","תשובה2"],"hint":"רמז","exp":"הסבר"}
]`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 8000, temperature: 0.8}
      })
    });
    const d = await res.json();
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch(e) {
    console.error(`  Error for ${topic.id}:`, e.message);
    return [];
  }
}

async function main() {
  const allQuestions = {};
  let total = 0;

  for (const topic of TOPICS) {
    const batchPrefix = `${prefix}_${topic.id.slice(0,2)}_`;
    process.stdout.write(`Generating ${perTopic} for ${topic.name}...`);
    const questions = await generateForTopic(topic, perTopic, batchPrefix);
    // Fix IDs to be unique
    const fixed = questions.map((q, i) => ({...q, id: `${prefix}_${topic.id.slice(0,3)}${String(i+1).padStart(3,"0")}`}));
    allQuestions[topic.id] = fixed;
    total += fixed.length;
    console.log(` ✓ ${fixed.length} questions`);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1500));
  }

  const outFile = `scripts/questions_${prefix}.json`;
  require("fs").writeFileSync(outFile, JSON.stringify(allQuestions, null, 2), "utf8");
  console.log(`\nDone! ${total} questions saved to ${outFile}`);
}

main();
