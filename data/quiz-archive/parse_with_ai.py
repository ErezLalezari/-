#!/usr/bin/env python3
"""
Parse Bible Quiz PDFs using Gemini AI via our Supabase proxy.
Much more robust than regex for messy Hebrew RTL text.
"""
import json, os, sys, time, re
from pathlib import Path
from collections import defaultdict
import urllib.request

ROOT = Path(__file__).parent
TEXT_DIR = ROOT / "text"
OUT_DIR = ROOT / "parsed_ai"
OUT_DIR.mkdir(exist_ok=True)

PROXY_URL = "https://mibqnkhvbgoavwamhmnp.supabase.co/functions/v1/ai-proxy"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA"

# Strip RTL markers
RTL_CHARS = "‫‪‬‭‮‎‏؜"
def clean(text):
    for c in RTL_CHARS:
        text = text.replace(c, "")
    return text

def call_ai(prompt, max_tokens=8000):
    body = json.dumps({"prompt": prompt, "maxTokens": max_tokens}).encode()
    req = urllib.request.Request(PROXY_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {ANON_KEY}")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
            return data.get("text", "")
    except Exception as e:
        print(f"  AI error: {e}")
        return ""

def parse_with_ai(text, year, stage):
    """Send text to Gemini and ask for structured JSON output."""
    cleaned = clean(text)
    # Limit text size — Gemini has token limits
    if len(cleaned) > 30000:
        cleaned = cleaned[:30000]

    prompt = f"""חלץ את כל שאלות החידון מתוך טקסט זה (חידון תנ"ך {year} - שלב {stage}).
לכל שאלה: מספר, טקסט שאלה, 4 אפשרויות (א/ב/ג/ד), תשובה נכונה (אם יש), המקור בתנ"ך (אם יש).

טקסט המקור:
---
{cleaned}
---

החזר JSON בלבד, פורמט מערך:
[
  {{"n":1,"q":"השאלה","options":["א","ב","ג","ד"],"answer_letter":"א","answer_text":"הרן","source":"בראשית יא, כו","book":"bereshit"}},
  ...
]

חוקים חשובים:
- אם אין תשובה ידועה, השאר answer_letter כ-null
- אם אין מקור, השאר source כ-""
- book חייב להיות אחד מ: bereshit, shemot, vayikra, bamidbar, devarim, yehoshua, shoftim, shmuel_a, shmuel_b, melachim_a, melachim_b, yeshayahu, yirmiyahu, yechezkel, hoshea, yoel, amos, ovadia, yona, micha, nachum, chavakuk, tzefania, chagai, zechariah, malachi, tehilim, mishlei, iyov, shir, rut, eicha, kohelet, esther, daniel, ezra, nechemya, divrei_a, divrei_b
- כלול את כל השאלות שיש בטקסט, אל תדלג
- אם השאלה ארוכה ויש פסוק או ציטוט, כלול את הכל
- החזר JSON בלבד, ללא טקסט נוסף לפני או אחרי
"""
    raw = call_ai(prompt, max_tokens=12000)
    if not raw:
        return []
    # Extract JSON
    raw = raw.replace("```json", "").replace("```", "").strip()
    # Find array
    arr_match = re.search(r"\[[\s\S]*\]", raw)
    if not arr_match:
        return []
    try:
        return json.loads(arr_match.group(0))
    except Exception as e:
        # Try to fix common issues — trailing commas, etc.
        try:
            cleaned_json = re.sub(r",\s*([}\]])", r"\1", arr_match.group(0))
            return json.loads(cleaned_json)
        except:
            print(f"  JSON parse failed: {e}")
            return []

def main():
    files = sorted(TEXT_DIR.glob("*.txt"))
    print(f"Found {len(files)} text files")

    # Group by (year, stage, sector) — combine question + answer files
    groups = defaultdict(dict)
    for f in files:
        parts = f.stem.split("_")
        if len(parts) < 4: continue
        key = (parts[0], parts[1], parts[2])
        type_ = "_".join(parts[3:])
        groups[key][type_] = f

    total_done = 0
    total_questions = 0

    for (year, stage, sector), types in sorted(groups.items()):
        out_name = f"{year}_{stage}_{sector}.json"
        out_path = OUT_DIR / out_name
        if out_path.exists() and out_path.stat().st_size > 100:
            # Already done
            existing = json.loads(out_path.read_text(encoding="utf-8"))
            total_done += 1
            total_questions += existing.get("questions_count", 0)
            continue

        # Pick the best source file (questions or qa)
        chosen = None
        for tname in ["qa","questions","session-a","written","written1","prelim","booklet","public"]:
            if tname in types:
                chosen = types[tname]
                break
        if not chosen:
            continue

        # If we have a separate answers file, combine them
        ans_file = None
        for tname in ["answers","session-a-answers","prelim-answers"]:
            if tname in types:
                ans_file = types[tname]
                break

        q_txt = chosen.read_text(encoding="utf-8")
        text_for_ai = q_txt
        if ans_file:
            a_txt = ans_file.read_text(encoding="utf-8")
            text_for_ai += "\n\n=== תשובון ===\n" + a_txt

        print(f"→ {year}/{stage}/{sector} ({len(text_for_ai)} chars)...", end=" ", flush=True)
        questions = parse_with_ai(text_for_ai, year, stage)
        print(f"got {len(questions)}")

        out_data = {
            "year": int(year),
            "stage": stage,
            "sector": sector,
            "questions_count": len(questions),
            "questions": questions,
        }
        out_path.write_text(json.dumps(out_data, ensure_ascii=False, indent=2), encoding="utf-8")
        total_questions += len(questions)
        total_done += 1
        time.sleep(2)  # Rate limit

    print(f"\n=== Done: {total_done} files, {total_questions} questions ===")

if __name__ == "__main__":
    main()
