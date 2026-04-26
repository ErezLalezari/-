#!/usr/bin/env python3
"""
Smarter parser v2:
- Strip RTL markers
- Use regex to find question blocks
- Use AI in small chunks (5 questions at a time) to clean up + extract structured data
"""
import json, re, os, sys, time
from pathlib import Path
from collections import defaultdict
import urllib.request

ROOT = Path(__file__).parent
TEXT_DIR = ROOT / "text"
OUT_DIR = ROOT / "parsed_v2"
OUT_DIR.mkdir(exist_ok=True)

PROXY_URL = "https://mibqnkhvbgoavwamhmnp.supabase.co/functions/v1/ai-proxy"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYnFua2h2YmdvYXZ3YW1obW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTQ3MzAsImV4cCI6MjA5MDkzMDczMH0.CsiTq5vK7Pjsi51P9tixoHIt1ZDD53o0drcOIabckOA"

# Strip RTL/LTR formatting markers
RTL_CHARS = "‫‪‬‭‮‎‏؜"
NIQUD_REGEX = re.compile(r"[֑-ׇ]")  # Hebrew vowels/cantillation

def clean(text):
    for c in RTL_CHARS:
        text = text.replace(c, "")
    return text

def light_clean(text):
    """Strip niqud and excess whitespace"""
    text = NIQUD_REGEX.sub("", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def call_ai(prompt, max_tokens=4000):
    body = json.dumps({"prompt": prompt, "maxTokens": max_tokens}).encode()
    req = urllib.request.Request(PROXY_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {ANON_KEY}")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
            return data.get("text", "")
    except Exception as e:
        print(f"  AI error: {e}", flush=True)
        return ""

def split_into_question_blocks(text):
    """Find chunks of text that look like Q + options.
    Hebrew RTL display puts numbers AFTER dot: ' .1 question text'
    """
    text = clean(text)
    # Match: optional whitespace + . + optional space + digit(s) + non-digit
    # Capture: number, then everything until next ".N" pattern or end
    pattern = re.compile(
        r"\.\s*(\d{1,2})\s*[\"'֐-׿]"  # ".1 " followed by Hebrew/quote
        r"([\s\S]*?)"  # block
        r"(?=\n\s*\.\s*\d{1,2}\s*[\"'֐-׿]|\s*©|בהצלחה|תשובון|\Z)",
        re.MULTILINE
    )
    blocks = []
    seen_nums = set()
    for m in pattern.finditer(text):
        n = int(m.group(1))
        if n in seen_nums or not (1 <= n <= 60):
            continue
        # Reconstruct: include the matched Hebrew/quote char that came right after number
        full = text[m.start():m.end()].strip()
        # Trim leading dot+number
        full = re.sub(r"^\s*\.\s*\d{1,2}\s*", "", full)
        if 20 <= len(full) <= 3000:
            seen_nums.add(n)
            blocks.append((n, full))
    return blocks

def parse_block_with_ai(block_text, q_num):
    """Send a single block to AI for clean extraction"""
    prompt = f"""מטקסט הבא של שאלת חידון תנ"ך, חלץ:
1. הטקסט של השאלה
2. 4 אפשרויות (א, ב, ג, ד)
3. אם יש תשובה נכונה — איזה אות

טקסט גולמי:
---
{block_text[:2000]}
---

החזר JSON בלבד:
{{"q":"השאלה","options":["א","ב","ג","ד"],"answer_letter":null,"source":""}}

ללא ניקוד וללא טקסט נוסף לפני או אחרי ה-JSON."""

    raw = call_ai(prompt, max_tokens=1000)
    if not raw:
        return None
    raw = raw.replace("```json", "").replace("```", "").strip()
    obj_match = re.search(r"\{[\s\S]*\}", raw)
    if not obj_match:
        return None
    try:
        parsed = json.loads(obj_match.group(0))
        if not parsed.get("q") or not parsed.get("options"):
            return None
        if len(parsed["options"]) != 4:
            return None
        return {**parsed, "n": q_num}
    except Exception as e:
        return None

def parse_answers_table(answers_text):
    """Extract answer letters from answer key"""
    text = clean(answers_text)
    # Pattern: lines with question number + Hebrew letter
    answers = {}
    # Match lines like "1 א" or "א 1" - just find pairs of (number, letter)
    pairs = re.findall(r"(\d{1,2})\s+([אבגדה])\b|([אבגדה])\s+(\d{1,2})\b", text)
    for m in pairs:
        if m[0] and m[1]:
            answers[int(m[0])] = m[1]
        elif m[2] and m[3]:
            answers[int(m[3])] = m[2]
    return answers

def find_files_for_group(year, stage, sector):
    """Find Q file and A file for a group"""
    files = list(TEXT_DIR.glob(f"{year}_{stage}_{sector}_*.txt"))
    q_file = None
    a_file = None
    for f in files:
        name = f.stem
        if any(t in name for t in ["_questions", "_qa", "_session-a$", "_written", "_written1", "_prelim", "_session-a"]) and "answers" not in name and "_a$" not in name and "prelim-answers" not in name:
            if not q_file: q_file = f
        if "answer" in name and "prelim" not in name:
            if not a_file: a_file = f
    # Fallback
    if not q_file:
        for f in files:
            if "answers" not in f.stem:
                q_file = f
                break
    return q_file, a_file

def main():
    # Get list of (year, stage, sector) groups
    files = sorted(TEXT_DIR.glob("*.txt"))
    groups = defaultdict(list)
    for f in files:
        parts = f.stem.split("_")
        if len(parts) < 4: continue
        groups[(parts[0], parts[1], parts[2])].append(f)

    # Filter to those without parsed_v2 result
    todo = []
    for key in sorted(groups.keys()):
        out_path = OUT_DIR / f"{'_'.join(key)}.json"
        if out_path.exists():
            try:
                d = json.loads(out_path.read_text())
                if d.get("questions_count", 0) > 0: continue
            except: pass
        todo.append(key)

    print(f"To process: {len(todo)} groups", flush=True)

    total = 0
    for i, (year, stage, sector) in enumerate(todo):
        q_file, a_file = find_files_for_group(year, stage, sector)
        if not q_file:
            continue
        print(f"\n[{i+1}/{len(todo)}] {year}/{stage}/{sector} ({q_file.name})", flush=True)

        q_txt = q_file.read_text(encoding="utf-8")
        blocks = split_into_question_blocks(q_txt)
        print(f"  Found {len(blocks)} candidate blocks", flush=True)

        # Parse answers if available
        answers_map = {}
        if a_file:
            a_txt = a_file.read_text(encoding="utf-8")
            answers_map = parse_answers_table(a_txt)
            print(f"  Found {len(answers_map)} answers in answer key", flush=True)

        # Process each block
        questions = []
        for n, block in blocks[:55]:  # cap at 55 questions per file
            parsed = parse_block_with_ai(block, n)
            if parsed:
                # Merge answer letter from answer key
                if n in answers_map:
                    parsed["answer_letter"] = answers_map[n]
                    letter_to_idx = {"א": 0, "ב": 1, "ג": 2, "ד": 3, "ה": 4}
                    idx = letter_to_idx.get(answers_map[n])
                    if idx is not None and idx < len(parsed["options"]):
                        parsed["answer_text"] = parsed["options"][idx]
                # Clean niqud from question text and options
                parsed["q"] = light_clean(parsed["q"])
                parsed["options"] = [light_clean(o) for o in parsed["options"]]
                if parsed.get("answer_text"):
                    parsed["answer_text"] = light_clean(parsed["answer_text"])
                questions.append(parsed)
                if len(questions) % 10 == 0:
                    print(f"  Progress: {len(questions)} questions extracted", flush=True)
            time.sleep(0.5)

        out_data = {
            "year": int(year),
            "stage": stage,
            "sector": sector,
            "questions_count": len(questions),
            "questions": questions,
        }
        out_path = OUT_DIR / f"{year}_{stage}_{sector}.json"
        out_path.write_text(json.dumps(out_data, ensure_ascii=False, indent=2), encoding="utf-8")
        total += len(questions)
        print(f"  ✓ Saved {len(questions)} questions", flush=True)

    print(f"\n=== Done! Total: {total} new questions extracted ===", flush=True)

if __name__ == "__main__":
    main()
