#!/usr/bin/env python3
"""
Parse Bible Quiz PDFs into structured JSON.
Reads txt/ directory (already extracted), writes parsed/ directory.
Each output: {year, stage, sector, type, questions: [{n, q, options, a, a_text, source, book}]}
"""
import json, re, os, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent
TEXT_DIR = ROOT / "text"
OUT_DIR = ROOT / "parsed"
OUT_DIR.mkdir(exist_ok=True)

# Strip Hebrew RTL/LTR formatting markers
RTL_CHARS = "‫‪‬‭‮‎‏؜"
def clean(text):
    for c in RTL_CHARS:
        text = text.replace(c, "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# Map Hebrew letters to indices
LETTER_TO_IDX = {"א": 0, "ב": 1, "ג": 2, "ד": 3, "ה": 4}

# Detect Tanakh book from source string
BOOK_NAMES = {
    "בראשית":"bereshit","שמות":"shemot","ויקרא":"vayikra","במדבר":"bamidbar","דברים":"devarim",
    "יהושע":"yehoshua","שופטים":"shoftim","שמואל":"shmuel","שמ\"א":"shmuel_a","שמ\"ב":"shmuel_b",
    "מלכים":"melachim","מל\"א":"melachim_a","מל\"ב":"melachim_b","ישעיהו":"yeshayahu","ישעיה":"yeshayahu",
    "ירמיהו":"yirmiyahu","ירמיה":"yirmiyahu","יחזקאל":"yechezkel","הושע":"hoshea","יואל":"yoel",
    "עמוס":"amos","עובדיה":"ovadia","יונה":"yona","מיכה":"micha","נחום":"nachum","חבקוק":"chavakuk",
    "צפניה":"tzefania","חגי":"chagai","זכריה":"zechariah","מלאכי":"malachi",
    "תהילים":"tehilim","תהלים":"tehilim","משלי":"mishlei","איוב":"iyov",
    "שיר השירים":"shir","רות":"rut","איכה":"eicha","קהלת":"kohelet","אסתר":"esther",
    "דניאל":"daniel","עזרא":"ezra","נחמיה":"nechemya","דה\"א":"divrei_a","דה\"ב":"divrei_b",
    "דברי הימים":"divrei",
}

def detect_book(source):
    """Find which book is mentioned in the source string."""
    if not source: return None
    for heb, en in BOOK_NAMES.items():
        if heb in source: return en
    return None

def parse_questions(txt):
    """Parse question PDF text. Returns list of {n, q, options}."""
    txt = clean(txt)
    # Find each numbered question: "1." through "60." (RTL: numbers before dots)
    # Pattern: digit(s) followed by . followed by text up to next number or end
    questions = []
    # Match: number + dot + question text + 4 options (א ב ג ד)
    # Use a flexible pattern that captures Q text and 4 options
    pattern = re.compile(
        r"(\d+)\s*[.׳]\s*(.+?)(?=\s+א\s*[.׳])"  # question text up to first option
        r"\s*א\s*[.׳]\s*(.+?)"  # option A
        r"\s+ב\s*[.׳]\s*(.+?)"  # option B
        r"\s+ג\s*[.׳]\s*(.+?)"  # option C
        r"\s+ד\s*[.׳]\s*(.+?)"  # option D
        r"(?=\s+\d+\s*[.׳]|\s*$)",  # until next number or end
        re.DOTALL
    )
    for m in pattern.finditer(txt):
        n = int(m.group(1))
        q = m.group(2).strip()
        opts = [m.group(i).strip() for i in range(3, 7)]
        # Skip if it's clearly not a real question (header, footer, etc.)
        if len(q) < 5 or len(q) > 500: continue
        if any(len(o) < 1 for o in opts): continue
        questions.append({"n": n, "q": q, "options": opts})
    return questions

def parse_answers(txt):
    """Parse answer key. Returns dict {n: {letter, text, source, book}}."""
    txt = clean(txt)
    answers = {}
    # Format observed: each line has number, letter, text, source
    # Try line-by-line approach
    lines = txt.split("\n") if "\n" in txt else re.split(r"\s{3,}", txt)
    # Actually let's regex: source/text/letter/number from RTL-flipped text
    # After cleaning, format becomes left-to-right: source text letter number? no wait
    # Let's try: match patterns of "letter [text] [source] [number]" in the cleaned text
    # Or: number + letter pattern
    # Simpler: find sequences of digits followed by hebrew letter
    pattern = re.compile(r"(\d+)\s+([אבגדה])\s+([^א-ת]*[א-ת][^\n]*?)(?=\s+\d+\s+[אבגדה]|\s*$)", re.DOTALL)
    for m in pattern.finditer(txt):
        n = int(m.group(1))
        letter = m.group(2)
        rest = m.group(3).strip()
        # rest contains text + source. Try to split.
        answers[n] = {"letter": letter, "rest": rest}
    return answers

def parse_file(name, txt):
    """Parse a single file. Try as questions first, then merge with matching answers."""
    return parse_questions(txt)

def main():
    files = sorted(TEXT_DIR.glob("*.txt"))
    print(f"Found {len(files)} text files")
    summary = {"total_questions": 0, "by_year": defaultdict(int), "by_stage": defaultdict(int)}

    # Group files by (year, stage, sector) so we can pair questions with answers
    groups = defaultdict(dict)
    for f in files:
        # Pattern: YEAR_STAGE_SECTOR_TYPE.txt
        parts = f.stem.split("_")
        if len(parts) < 4: continue
        year = parts[0]; stage = parts[1]; sector = parts[2]
        type_ = "_".join(parts[3:])
        key = (year, stage, sector)
        groups[key][type_] = f

    for (year, stage, sector), types in groups.items():
        # Look for question file
        q_file = None
        a_file = None
        for tname in ["questions", "qa", "session-a", "written", "written1", "prelim", "booklet", "public"]:
            if tname in types:
                q_file = types[tname]
                break
        for tname in ["answers", "session-a-answers", "prelim-answers"]:
            if tname in types:
                a_file = types[tname]
                break

        if not q_file: continue

        q_txt = q_file.read_text(encoding="utf-8")
        questions = parse_questions(q_txt)
        if not questions: continue

        a_map = {}
        if a_file:
            a_txt = a_file.read_text(encoding="utf-8")
            a_map = parse_answers(a_txt)

        # Merge
        merged = []
        for q in questions:
            n = q["n"]
            ans = a_map.get(n, {})
            letter = ans.get("letter")
            answer_idx = LETTER_TO_IDX.get(letter)
            answer_text = q["options"][answer_idx] if answer_idx is not None and answer_idx < len(q["options"]) else None
            source = ans.get("rest", "")
            book = detect_book(source)
            merged.append({
                "n": n,
                "q": q["q"],
                "options": q["options"],
                "answer_letter": letter,
                "answer_text": answer_text,
                "source": source,
                "book": book,
            })

        out_name = f"{year}_{stage}_{sector}.json"
        out_data = {
            "year": int(year),
            "stage": stage,
            "sector": sector,
            "questions_file": q_file.name,
            "answers_file": a_file.name if a_file else None,
            "questions_count": len(merged),
            "questions": merged,
        }
        (OUT_DIR / out_name).write_text(json.dumps(out_data, ensure_ascii=False, indent=2), encoding="utf-8")
        summary["total_questions"] += len(merged)
        summary["by_year"][year] += len(merged)
        summary["by_stage"][stage] += len(merged)
        print(f"✓ {year}/{stage}/{sector}: {len(merged)} questions")

    print(f"\n=== Summary ===")
    print(f"Total questions parsed: {summary['total_questions']}")
    print(f"By year: {dict(summary['by_year'])}")
    print(f"By stage: {dict(summary['by_stage'])}")

if __name__ == "__main__":
    main()
