(function () {
  const STATE = {
    journals: [],
    journalMap: new Map(),
    aliasMap: new Map(),
    initialized: false,
    observer: null
  };

  const isPubMed = location.hostname === "pubmed.ncbi.nlm.nih.gov";
  const isScholar = location.hostname === "scholar.google.com";

  function normalize(value) {
    return (value || "")
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\b(the|journal of|j)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function abbreviationAlias(title) {
    const dictionary = {
      "american": "am",
      "annals": "ann",
      "archive": "arch",
      "archives": "arch",
      "association": "assoc",
      "biology": "biol",
      "biomedical": "biomed",
      "british": "br",
      "cancer": "cancer",
      "cellular": "cell",
      "chemistry": "chem",
      "clinical": "clin",
      "communications": "commun",
      "disease": "dis",
      "diseases": "dis",
      "endocrinology": "endocrinol",
      "england": "engl",
      "environmental": "environ",
      "european": "eur",
      "experimental": "exp",
      "gastroenterology": "gastroenterol",
      "genetics": "genet",
      "hematology": "hematol",
      "hepatology": "hepatol",
      "immunology": "immunol",
      "infectious": "infect",
      "international": "int",
      "journal": "j",
      "medical": "med",
      "medicine": "med",
      "microbiology": "microbiol",
      "molecular": "mol",
      "national": "natl",
      "nature": "nat",
      "network": "netw",
      "neurology": "neurol",
      "new": "n",
      "oncology": "oncol",
      "pediatric": "pediatr",
      "pediatrics": "pediatr",
      "pharmacology": "pharmacol",
      "physiology": "physiol",
      "proceedings": "proc",
      "psychiatry": "psychiatry",
      "public": "public",
      "reports": "rep",
      "research": "res",
      "respiratory": "respir",
      "review": "rev",
      "reviews": "rev",
      "science": "sci",
      "sciences": "sci",
      "society": "soc",
      "surgery": "surg",
      "transplantation": "transplant"
    };
    const words = normalize(title)
      .split(" ")
      .filter((word) => word && !["and", "of", "for", "in", "on"].includes(word));
    return words.map((word) => dictionary[word] || word).join(" ");
  }

  function acronymAlias(title) {
    const words = normalize(title)
      .split(" ")
      .filter((word) => word.length > 2 && !["and", "the", "for", "with"].includes(word));
    return words.map((word) => word[0]).join("");
  }

  async function loadJournals() {
    if (STATE.journals.length) return;
    const manifestUrl = chrome.runtime.getURL("data/chunks/manifest.json");
    const chunkManifest = await fetch(manifestUrl).then((response) => response.json());
    const chunkRequests = [];
    for (let index = 1; index <= chunkManifest.parts; index += 1) {
      const name = `data/chunks/journals.part${String(index).padStart(2, "0")}.txt`;
      chunkRequests.push(fetch(chrome.runtime.getURL(name)).then((response) => response.text()));
    }
    const encoded = (await Promise.all(chunkRequests)).join("");
    const bytes = Uint8Array.from(atob(encoded.trim()), (char) => char.charCodeAt(0));
    const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("gzip"));
    const data = await new Response(stream).json();
    STATE.journals = (data.journals || []).map((row) => ({
      title: row[0],
      normalizedTitle: row[1],
      impactFactor: row[2],
      quartile: row[3],
      rank: row[4],
      issn: row[5]
    }));
    for (const journal of STATE.journals) {
      if (!STATE.journalMap.has(journal.normalizedTitle)) {
        STATE.journalMap.set(journal.normalizedTitle, journal);
      }
      for (const alias of [abbreviationAlias(journal.title), acronymAlias(journal.title)]) {
        const normalizedAlias = normalize(alias);
        if (normalizedAlias.length > 2 && !STATE.aliasMap.has(normalizedAlias)) {
          STATE.aliasMap.set(normalizedAlias, journal);
        }
      }
    }
    addManualAliases();
  }

  function findJournalByLooseTitle(title) {
    const wanted = normalize(title);
    return STATE.journals.find((journal) => {
      const journalTitle = journal.normalizedTitle;
      return journalTitle === wanted || journalTitle.includes(wanted) || wanted.includes(journalTitle);
    }) || null;
  }

  function addManualAliases() {
    const aliases = {
      "jama netw open": "JAMA Network Open",
      "n engl j med": "New England Journal of Medicine",
      "j formos med assoc": "Journal of the Formosan Medical Association",
      "lancet respir med": "Lancet Respiratory Medicine",
      "lancet infect dis": "Lancet Infectious Diseases",
      "j clin oncol": "Journal of Clinical Oncology",
      "eur heart j": "European Heart Journal",
      "nat med": "Nature Medicine",
      "nat genet": "Nature Genetics",
      "nat immunol": "Nature Immunology",
      "nat methods": "Nature Methods",
      "nat rev cancer": "Nature Reviews Cancer",
      "nat rev immunol": "Nature Reviews Immunology",
      "nat rev microbiol": "Nature Reviews Microbiology",
      "ann oncol": "Annals of Oncology",
      "cancer discov": "Cancer Discovery",
      "mol cancer": "Molecular Cancer"
    };

    for (const [alias, title] of Object.entries(aliases)) {
      const journal = findJournalByLooseTitle(title);
      if (journal) STATE.aliasMap.set(normalize(alias), journal);
    }
  }

  function findJournal(rawText) {
    const text = normalize(rawText);
    if (!text) return null;

    const exact = STATE.journalMap.get(text);
    if (exact) return exact;

    const alias = STATE.aliasMap.get(text);
    if (alias) return alias;

    let best = null;
    let bestLength = 0;
    for (const journal of STATE.journals) {
      const title = journal.normalizedTitle;
      if (title.length < 5) continue;
      if (text.includes(title) || title.includes(text)) {
        if (title.length > bestLength) {
          best = journal;
          bestLength = title.length;
        }
      }
    }
    return best;
  }

  function makeButton(label, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pcx-button";
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }

  function addToolbar(kind, mount, sorters) {
    if (!mount || document.querySelector(`.pcx-toolbar[data-kind="${kind}"]`)) return;

    const toolbar = document.createElement("div");
    toolbar.className = "pcx-toolbar";
    toolbar.dataset.kind = kind;

    const label = document.createElement("span");
    label.className = "pcx-toolbar-label";
    label.textContent = kind === "pubmed" ? "Sort PubMed" : "Sort Scholar";
    toolbar.append(label);

    for (const sorter of sorters) {
      toolbar.append(makeButton(sorter.label, sorter.title, sorter.run));
    }

    mount.prepend(toolbar);
  }

  function badge(text, tone) {
    const element = document.createElement("span");
    element.className = `pcx-badge pcx-${tone}`;
    element.textContent = text;
    return element;
  }

  function parsePubMedJournal(citationText) {
    const cleaned = (citationText || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const beforeDate = cleaned.split(/\.\s+\d{4}|\.\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}/)[0];
    return beforeDate.replace(/\.$/, "").trim();
  }

  function getPubMedItems() {
    const selectors = [
      ".docsum-wrap",
      ".full-docsum",
      ".results-article",
      "article.full-docsum",
      "article"
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    const items = nodes.filter((item, index) => {
      return nodes.findIndex((other) => other !== item && other.contains(item)) === -1 || index === nodes.indexOf(item);
    });

    return items.map((item) => {
      const content = item.querySelector(".docsum-content, .full-docsum-content, .results-article-content") || item;
      const citation = content.querySelector(
        ".docsum-journal-citation, .full-journal-citation, .docsum-citation, .citation"
      );
      return { item, content, citation };
    }).filter((entry) => entry.item && entry.content && entry.content.querySelector("a, .docsum-title"));
  }

  function annotatePubMed() {
    const items = getPubMedItems();
    for (const entry of items) {
      if (entry.content.querySelector(".pcx-if-badge")) continue;

      const citationText = entry.citation ? entry.citation.textContent : "";
      const journalName = parsePubMedJournal(citationText);
      const journal = findJournal(journalName || citationText);
      const target = entry.citation || entry.content.querySelector(".docsum-citation, .full-citation") || entry.content;

      if (journal) {
        entry.item.dataset.pcxImpactFactor = String(journal.impactFactor);
        entry.item.dataset.pcxJournal = journal.title;
        const ifBadge = badge(`IF ${journal.impactFactor.toFixed(1)} ${journal.quartile}`, "if pcx-if-badge");
        ifBadge.title = `${journal.title}, rank ${journal.rank}, ISSN ${journal.issn}`;
        target.append(" ", ifBadge);
      } else {
        entry.item.dataset.pcxImpactFactor = "";
        const missingBadge = badge("IF not found", "missing pcx-if-badge");
        missingBadge.title = `No bundled JIF match for: ${journalName || citationText || "unknown journal"}`;
        target.append(" ", missingBadge);
      }
    }
  }

  function sortPubMed(direction) {
    annotatePubMed();
    const entries = getPubMedItems();
    const sorted = entries.slice().sort((a, b) => {
      const av = Number(a.item.dataset.pcxImpactFactor || "-1");
      const bv = Number(b.item.dataset.pcxImpactFactor || "-1");
      return direction === "desc" ? bv - av : av - bv;
    });
    const parent = sorted[0] && sorted[0].item.parentElement;
    if (!parent) return;
    for (const entry of sorted) parent.appendChild(entry.item);
  }

  function initPubMed() {
    annotatePubMed();
    const mount = document.querySelector(".search-results, main, #search-results");
    addToolbar("pubmed", mount, [
      { label: "IF high", title: "Sort visible results by highest impact factor", run: () => sortPubMed("desc") },
      { label: "IF low", title: "Sort visible results by lowest impact factor", run: () => sortPubMed("asc") }
    ]);
  }

  function getScholarItems() {
    return Array.from(document.querySelectorAll(".gs_r.gs_or.gs_scl")).filter((item) => item.querySelector(".gs_ri"));
  }

  function parseCitation(item) {
    const links = Array.from(item.querySelectorAll(".gs_fl a"));
    const cited = links.find((link) => /Cited by\s+\d+/i.test(link.textContent));
    if (!cited) return 0;
    const match = cited.textContent.match(/Cited by\s+([\d,]+)/i);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  }

  function parseScholarVenue(item) {
    const meta = item.querySelector(".gs_a");
    const text = meta ? meta.textContent : "";
    const pieces = text.split(/\s+-\s+/);
    if (pieces.length < 2) return text;
    const middle = pieces[1].replace(/\b\d{4}\b.*$/, "").trim();
    return middle || text;
  }

  function annotateScholar() {
    for (const item of getScholarItems()) {
      const result = item.querySelector(".gs_ri");
      if (!result || result.querySelector(".pcx-citation-badge")) continue;

      const citations = parseCitation(item);
      const title = result.querySelector(".gs_rt");
      item.dataset.pcxCitations = String(citations);
      if (title) {
        title.append(" ", badge(`${citations} cites`, "cite pcx-citation-badge"));
      }

      const journal = findJournal(parseScholarVenue(item));
      if (journal && title) {
        item.dataset.pcxImpactFactor = String(journal.impactFactor);
        const ifBadge = badge(`IF ${journal.impactFactor.toFixed(1)}`, "if pcx-if-badge");
        ifBadge.title = `${journal.title}, ${journal.quartile}`;
        title.append(" ", ifBadge);
      }
    }
  }

  function sortScholar(field, direction) {
    annotateScholar();
    const items = getScholarItems();
    const sorted = items.slice().sort((a, b) => {
      const fallback = field === "pcxImpactFactor" ? "-1" : "0";
      const av = Number(a.dataset[field] || fallback);
      const bv = Number(b.dataset[field] || fallback);
      return direction === "desc" ? bv - av : av - bv;
    });
    const parent = document.querySelector("#gs_res_ccl_mid");
    if (!parent) return;
    for (const item of sorted) parent.appendChild(item);
  }

  function initScholar() {
    annotateScholar();
    const mount = document.querySelector("#gs_res_ccl, #gs_bdy");
    addToolbar("scholar", mount, [
      { label: "Cites high", title: "Sort visible results by most citations", run: () => sortScholar("pcxCitations", "desc") },
      { label: "Cites low", title: "Sort visible results by fewest citations", run: () => sortScholar("pcxCitations", "asc") },
      { label: "IF high", title: "Sort visible results by highest matched impact factor", run: () => sortScholar("pcxImpactFactor", "desc") }
    ]);
  }

  function scheduleRefresh() {
    window.clearTimeout(scheduleRefresh.timer);
    scheduleRefresh.timer = window.setTimeout(() => {
      if (isPubMed) initPubMed();
      if (isScholar) initScholar();
    }, 250);
  }

  async function init() {
    if (STATE.initialized || (!isPubMed && !isScholar)) return;
    STATE.initialized = true;
    await loadJournals();
    scheduleRefresh();
    STATE.observer = new MutationObserver(scheduleRefresh);
    STATE.observer.observe(document.body, { childList: true, subtree: true });
  }

  init().catch((error) => {
    console.error("PubMed IF & Scholar Citation Sorter failed to initialize", error);
  });
})();
