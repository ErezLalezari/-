#!/bin/bash
# Download all official Bible quiz PDFs from Ministry of Education
# Run from /Users/erez.lalezari/Repos/Projects/leya-app/data/quiz-archive/

set -e
cd "$(dirname "$0")"

MANIFEST="url-manifest.json"
PDF_DIR="pdfs"
mkdir -p "$PDF_DIR"

count=0
ok=0
skip=0
fail=0

# Use Python to parse JSON and feed each URL
python3 -c "
import json
with open('$MANIFEST') as f:
    items = json.load(f)
for it in items:
    fname = f\"{it['year']}_{it['stage']}_{it['sector']}_{it['type']}\"
    print(f\"{fname}|{it['url']}\")
" | while IFS='|' read -r fname url; do
    count=$((count + 1))
    # Determine extension from URL
    if [[ "$url" == *.pdf ]]; then
        ext="pdf"
    elif [[ "$url" == *.doc ]]; then
        ext="doc"
    else
        ext="bin"
    fi
    out="$PDF_DIR/${fname}.${ext}"
    if [ -f "$out" ] && [ -s "$out" ]; then
        skip=$((skip + 1))
        continue
    fi
    if curl -sLf -o "$out" "$url"; then
        size=$(wc -c < "$out")
        if [ "$size" -lt 100 ]; then
            rm "$out"
            fail=$((fail + 1))
            echo "❌ $fname (empty)"
        else
            ok=$((ok + 1))
            printf "✓ %-50s %dKB\n" "$fname" $((size / 1024))
        fi
    else
        fail=$((fail + 1))
        echo "❌ $fname (download failed)"
    fi
done

echo ""
echo "Total: $count files | Downloaded: $ok | Skipped: $skip | Failed: $fail"
ls -la "$PDF_DIR" | tail -5
