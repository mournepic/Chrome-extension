from __future__ import annotations

import base64
import gzip
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"C:\Users\such_\Downloads\JCRI-mpact-Factors_2025.pdf")
CHUNK_DIR = ROOT / "data" / "chunks"
CHUNK_SIZE = 70_000

PUBLISHERS = [
    "NATURE PORTFOLIO",
    "ELSEVIER SCIENCE INC",
    "ELSEVIER SCI LTD",
    "ELSEVIER INC",
    "ELSEVIER TAIWAN",
    "WILEY-V C H VERLAG GMBH",
    "WILEY",
    "SPRINGERNATURE",
    "SPRINGER INT PUBL AG",
    "SPRINGER",
    "BMC",
    "BMJ PUBLISHING GROUP",
    "CELL PRESS",
    "PERGAMON-ELSEVIER SCIENCE LTD",
    "AMER CHEMICAL SOC",
    "AMER MEDICAL ASSOC",
    "AMER PHYSICAL SOC",
    "AMER ASSOC ADVANCEMENT SCIENCE",
    "AMER ASSOC CANCER RESEARCH",
    "LIPPINCOTT WILLIAMS & WILKINS",
    "OXFORD UNIV PRESS",
    "ROYAL SOC CHEMISTRY",
    "ANNUAL REVIEWS",
    "IEEE-INST ELECTRICAL ELECTRONICS ENGINEERS INC",
    "FRONTIERS MEDIA SA",
    "MDPI",
    "TAYLOR & FRANCIS",
    "SAGE PUBLICATIONS",
    "WOLTERS KLUWER",
    "MARY ANN LIEBERT",
    "PUBLIC LIBRARY SCIENCE",
    "ROCKEFELLER UNIV PRESS",
    "FEDERATION AMER SOC EXP BIOL",
    "CAMBRIDGE UNIV PRESS",
    "UNIV CHICAGO PRESS",
    "IOS PRESS",
    "KARGER",
    "HINDAWI LTD",
    "KEAI PUBLISHING LTD",
    "DOVE MEDICAL PRESS LTD",
    "IMPACT JOURNALS LLC",
    "MDPI AG",
    "ASSOC COMPUTING MACHINERY",
    "NATL ACAD SCIENCES",
    "AMER SOC MICROBIOLOGY",
    "AMER SOC HEMATOLOGY",
    "ENDOCRINE SOC",
    "AMER HEART ASSOC",
    "AMER PHYSIOLOGICAL SOC",
    "SOC NEUROSCIENCE",
    "COMPANY BIOLOGISTS LTD",
    "COLD SPRING HARBOR LAB PRESS",
]


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("&", "and")
    value = re.sub(r"\b(the|journal of|j)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def guess_title(prefix: str) -> str:
    text = " ".join(prefix.split())
    upper = text.upper()
    for publisher in sorted(PUBLISHERS, key=len, reverse=True):
        index = upper.find(publisher)
        if index > 1:
            return text[:index].strip(" -")
    return text.strip()


def main() -> None:
    reader = PdfReader(str(PDF_PATH))
    line_re = re.compile(r"^\s*(\d+)\s+(.+?)\s+(N/A|\d{4}-[0-9Xx]{4})\s+(\d+(?:\.\d+)?)\s+(Q[1-4])\s*$")
    rows = []
    seen = set()

    for page in reader.pages:
        text = page.extract_text() or ""
        for raw in text.splitlines():
            match = line_re.match(" ".join(raw.split()))
            if not match:
                continue
            rank, prefix, issn, impact_factor, quartile = match.groups()
            title = guess_title(prefix)
            key = (normalize(title), issn.upper(), impact_factor)
            if key in seen:
                continue
            seen.add(key)
            rows.append([title, normalize(title), float(impact_factor), quartile, int(rank), issn.upper()])

    rows.sort(key=lambda row: (row[4], row[0]))
    payload = json.dumps(
        {"source": PDF_PATH.name, "fields": ["title", "normalizedTitle", "impactFactor", "quartile", "rank", "issn"], "journals": rows},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    encoded = base64.b64encode(gzip.compress(payload, compresslevel=9)).decode("ascii")

    CHUNK_DIR.mkdir(parents=True, exist_ok=True)
    for old in CHUNK_DIR.glob("journals.part*.txt"):
        old.unlink()

    parts = [encoded[index:index + CHUNK_SIZE] for index in range(0, len(encoded), CHUNK_SIZE)]
    for index, part in enumerate(parts, 1):
        (CHUNK_DIR / f"journals.part{index:02d}.txt").write_text(part, encoding="ascii")
    (CHUNK_DIR / "manifest.json").write_text(json.dumps({"parts": len(parts)}), encoding="ascii")

    print(f"Wrote {len(rows)} journals into {len(parts)} chunks.")


if __name__ == "__main__":
    main()
