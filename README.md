# PubMed IF & Scholar Citation Sorter

Chrome extension for showing journal impact factors on PubMed and citation counts on Google Scholar search result pages.

## Features

- PubMed search results: adds `IF` and quartile badges when the journal can be matched.
- PubMed search results: shows `IF not found` when the extension is active but no bundled JIF match is found.
- Google Scholar search results: adds citation badges from visible `Cited by` links.
- Sorting controls:
  - PubMed: sort visible results by impact factor, high or low.
  - Google Scholar: sort visible results by citation count, high or low.
  - Google Scholar: sort visible results by matched impact factor, high first.

## Install locally

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click `Load unpacked`.
4. Select this folder:
   `C:\Users\such_\Documents\Codex\2026-04-25\pubmed-if-scholar-citation-chrome-extension`

## Data

The bundled journal database was extracted from and compressed from:

`C:\Users\such_\Downloads\JCRI-mpact-Factors_2025.pdf`

To rebuild the chunked data files from the PDF, install `requirements.txt` and run:

```powershell
python scripts/build_journal_chunks.py
```

The extension sorts only the results currently visible on the page. It does not fetch extra PubMed or Google Scholar pages in the background.
