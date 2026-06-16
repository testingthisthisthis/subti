(() => {
  const HIT_CLASS = 'search-hit';
  const CURRENT_CLASS = 'search-hit-current';

  const PAGES = [
    { href: 'index.html', title: 'Home' },
    { href: 'download.html', title: 'Download' },
    { href: 'faq.html', title: 'FAQ' },
    { href: 'howto.html', title: 'How to' },
    { href: 'support.html', title: 'Support' },
    { href: 'philosophy.html', title: 'Philosophy' },
    { href: 'edge-tts-languages.html', title: 'tts-edge languages' },
    { href: 'news.html', title: 'News' },
  ];

  let lastQuery = '';
  let currentIndex = 0;
  /** @type {HTMLElement[]} */
  let hits = [];

  /** @type {HTMLElement | null} */
  let resultsEl = null;

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getQueryParam = () => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('q');
    return raw ? raw.trim() : '';
  };

  const setQueryParam = (query) => {
    const url = new URL(window.location.href);
    if (!query) {
      url.searchParams.delete('q');
    } else {
      url.searchParams.set('q', query);
    }
    window.history.replaceState({}, '', url);
  };

  const clearCurrent = () => {
    for (const hit of hits) {
      hit.classList.remove(CURRENT_CLASS);
    }
  };

  const unwrapMarks = (root) => {
    const marks = root.querySelectorAll(`mark.${HIT_CLASS}`);
    for (const mark of marks) {
      const textNode = document.createTextNode(mark.textContent || '');
      mark.replaceWith(textNode);
      if (textNode.parentNode) {
        textNode.parentNode.normalize();
      }
    }
  };

  const ensureResultsEl = () => {
    if (resultsEl && resultsEl.isConnected) return resultsEl;
    const container = document.querySelector('.container');
    if (!container) return null;

    resultsEl = document.createElement('div');
    resultsEl.className = 'search-results';
    resultsEl.setAttribute('aria-live', 'polite');

    const anchor = container.querySelector('.line-top');
    if (anchor && anchor.parentElement === container) {
      anchor.insertAdjacentElement('afterend', resultsEl);
    } else {
      container.prepend(resultsEl);
    }

    return resultsEl;
  };

  const clearResults = () => {
    const el = ensureResultsEl();
    if (el) el.innerHTML = '';
  };

  const buildHighlights = (root, query) => {
    unwrapMarks(root);
    hits = [];

    if (!query) return;

    const regex = new RegExp(escapeRegExp(query), 'gi');
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue;
          if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;

          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          if (parent.closest('script, style, noscript, textarea, input, select, option')) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.closest('.header-top, .menu, .social-buttons')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false,
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue || '';
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;

      const fragment = document.createDocumentFragment();
      let lastIndexInNode = 0;

      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        if (start > lastIndexInNode) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndexInNode, start)));
        }

        const mark = document.createElement('mark');
        mark.className = HIT_CLASS;
        mark.textContent = text.slice(start, end);
        fragment.appendChild(mark);
        hits.push(mark);

        lastIndexInNode = end;

        if (match.index === regex.lastIndex) {
          regex.lastIndex += 1;
        }
      }

      if (lastIndexInNode < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndexInNode)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  };

  const setCurrent = (index) => {
    clearCurrent();
    if (!hits.length) return;

    const normalized = ((index % hits.length) + hits.length) % hits.length;
    currentIndex = normalized;
    const el = hits[normalized];
    el.classList.add(CURRENT_CLASS);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const clearSearch = (root, input) => {
    lastQuery = '';
    currentIndex = 0;
    hits = [];
    unwrapMarks(root);
    if (input) input.value = '';
    clearResults();
    setQueryParam('');
  };

  const textForPage = (doc) => {
    const contentRoot = doc.querySelector('.hero-text') || doc.body;
    if (!contentRoot) return '';
    return (contentRoot.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const countMatches = (haystack, query) => {
    if (!haystack || !query) return 0;
    const regex = new RegExp(escapeRegExp(query), 'gi');
    const matches = haystack.match(regex);
    return matches ? matches.length : 0;
  };

  const makeSnippet = (haystack, query, radius = 65) => {
    const lower = haystack.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) return '';

    const start = Math.max(0, idx - radius);
    const end = Math.min(haystack.length, idx + query.length + radius);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < haystack.length ? '…' : '';
    return `${prefix}${haystack.slice(start, end)}${suffix}`;
  };

  const renderResults = (query, results, hadFetchError) => {
    const el = ensureResultsEl();
    if (!el) return;

    if (!query) {
      el.innerHTML = '';
      return;
    }

    if (hadFetchError) {
      el.innerHTML =
        `<div class="search-error">Site search needs a web server to fetch pages (for example VS Code “Live Server”).</div>`;
      return;
    }

    if (!results.length) {
      el.innerHTML = `<div class="search-meta">No results for “${query}”.</div>`;
      return;
    }

    const items = results
      .map((r) => {
        const snippet = r.snippet ? `<div class="search-meta">${r.snippet}</div>` : '';
        const meta = `<div class="search-meta">${r.count} match${r.count === 1 ? '' : 'es'}</div>`;
        return `<li><a href="${r.href}?q=${encodeURIComponent(query)}">${r.title}</a>${meta}${snippet}</li>`;
      })
      .join('');

    el.innerHTML = `<div class="search-meta">Results for “${query}”:</div><ul>${items}</ul>`;
  };

  const searchAllPages = async (query) => {
    /** @type {{href: string, title: string, count: number, snippet: string}[]} */
    const results = [];
    let hadFetchError = false;

    for (const page of PAGES) {
      try {
        const resp = await fetch(page.href, { cache: 'no-store' });
        if (!resp.ok) continue;
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const text = textForPage(doc);
        const count = countMatches(text, query);
        if (count > 0) {
          results.push({
            href: page.href,
            title: page.title,
            count,
            snippet: makeSnippet(text, query),
          });
        }
      } catch {
        hadFetchError = true;
      }
    }

    return { results, hadFetchError };
  };

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.querySelector('.search input');
    if (!(input instanceof HTMLInputElement)) return;

    const root = document.querySelector('.container') || document.body;

    const run = async (query) => {
      const trimmed = query.trim();
      if (!trimmed) {
        clearSearch(root, input);
        return;
      }

      setQueryParam(trimmed);

      if (trimmed !== lastQuery) {
        lastQuery = trimmed;
        currentIndex = 0;
        buildHighlights(root, trimmed);
        setCurrent(0);

        const { results, hadFetchError } = await searchAllPages(trimmed);
        renderResults(trimmed, results, hadFetchError);
        return;
      }

      if (hits.length) {
        setCurrent(currentIndex + 1);
        return;
      }

      buildHighlights(root, trimmed);
      setCurrent(0);
      const { results, hadFetchError } = await searchAllPages(trimmed);
      renderResults(trimmed, results, hadFetchError);
    };

    const urlQuery = getQueryParam();
    if (urlQuery) {
      input.value = urlQuery;
      void run(urlQuery);
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();

        void run(input.value);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearSearch(root, input);
      }
    });

    // If present, enhance the edge-tts languages table: title-case names and add speaker/source links.
    const edgeTable = document.querySelector('table.edge-tts-language-table');
    if (edgeTable instanceof HTMLTableElement) {
      const titleCase = (value) => {
        const acronyms = new Set(['UAE', 'UK', 'US']);
        return value
          .split(/\s+/)
          .map((word) => {
            const cleaned = word.replace(/[^A-Za-z]/g, '');
            if (cleaned && acronyms.has(cleaned.toUpperCase())) {
              return word.replace(cleaned, cleaned.toUpperCase());
            }

            const idx = word.search(/[A-Za-z]/);
            if (idx === -1) return word;
            const ch = word[idx];
            return word.slice(0, idx) + ch.toUpperCase() + word.slice(idx + 1);
          })
          .join(' ')
          .replace(/\(([a-z])/g, (_, c) => `(${c.toUpperCase()}`);
      };

      const rows = edgeTable.querySelectorAll('tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;

        const languageCell = cells[0];
        const infoCell = cells[1];

        const raw = (languageCell.textContent || '').trim();
        if (!raw) continue;

        const display = titleCase(raw);
        languageCell.textContent = display;

        const base = display.split('(')[0].trim();
        const url = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(base + ' language')}`;
        infoCell.innerHTML = `<a href="${url}">Wikipedia (see estimates)</a>`;
      }
    }
  });
})();
