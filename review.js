/* ─────────────────────────────────────────────
   Review / Annotation tool
   For mentor walkthroughs. Captures comments tied
   to clicked locations and exports as Markdown/JSON.

   Notes are stored in localStorage on the reviewer's
   browser. Exports include all notes across pages.
   ───────────────────────────────────────────── */

(() => {
  const STORAGE_KEY = 'huang_lab_review_notes_v1';
  const HIDDEN_KEY  = 'huang_lab_review_hidden_v1';

  /* ── visibility gate ──
     The tool can be hidden by clicking × on the FAB.
     To bring it back: visit any page with ?review=on
     (or clear the localStorage flag manually). */
  const params = new URLSearchParams(location.search);
  if (params.get('review') === 'on') {
    localStorage.removeItem(HIDDEN_KEY);
  } else if (params.get('review') === 'off') {
    localStorage.setItem(HIDDEN_KEY, '1');
    return;
  } else if (localStorage.getItem(HIDDEN_KEY) === '1') {
    return;
  }

  /* ── storage ── */
  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  };
  const save = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  const add  = (c)   => { const a = load(); a.push({ ...c, id: Date.now() + Math.random(), ts: new Date().toISOString() }); save(a); };
  const del  = (id)  => save(load().filter(c => c.id !== id));
  const clr  = ()    => save([]);

  /* ── build UI ── */
  const root = document.createElement('div');
  root.className = 'review-ui';
  root.innerHTML = `
    <div class="review-fab" role="group" aria-label="Review tool">
      <button type="button" id="reviewFabView">Notes <span id="reviewFabCount">0</span></button>
      <button type="button" id="reviewFabAnno">+ Add note</button>
      <button type="button" id="reviewFabHide" aria-label="Hide review tool" title="Hide review tool">×</button>
    </div>

    <div class="review-tip" id="reviewTip" hidden>
      <button type="button" id="reviewTipBtn">+ Add note here</button>
    </div>

    <div class="review-modal-backdrop" id="reviewBackdrop" hidden>
      <form class="review-modal" id="reviewModal" autocomplete="off">
        <h3>Add review note</h3>
        <label class="review-field">
          <span>Place</span>
          <input type="text" id="reviewPlace" required>
          <small>Auto-filled from where you clicked. You can edit this.</small>
        </label>
        <label class="review-field">
          <span>Suggestion</span>
          <textarea id="reviewSuggestion" rows="5" required placeholder="What should be changed here?"></textarea>
        </label>
        <div class="review-actions">
          <button type="button" id="reviewCancel">Cancel</button>
          <button type="submit" id="reviewSave">Save note</button>
        </div>
      </form>
    </div>

    <aside class="review-panel" id="reviewPanel" hidden aria-label="Review notes panel">
      <header>
        <h3>Review notes</h3>
        <button type="button" id="reviewPanelClose" aria-label="Close">×</button>
      </header>
      <div class="review-list" id="reviewList"></div>
      <footer>
        <button type="button" id="reviewCopyPrompt">Copy as Claude prompt</button>
        <button type="button" id="reviewExportMd">Export Markdown</button>
        <button type="button" id="reviewExportJson">Export JSON</button>
        <button type="button" id="reviewClear" class="review-danger">Clear all</button>
      </footer>
    </aside>
  `;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  const fabAnno  = $('reviewFabAnno');
  const fabView  = $('reviewFabView');
  const fabCount = $('reviewFabCount');
  const tip      = $('reviewTip');
  const tipBtn   = $('reviewTipBtn');
  const backdrop = $('reviewBackdrop');
  const modal    = $('reviewModal');
  const placeIn  = $('reviewPlace');
  const suggIn   = $('reviewSuggestion');
  const panel    = $('reviewPanel');
  const listEl   = $('reviewList');

  let mode = 'off';        // 'off' | 'annotate'
  let lastTarget = null;

  /* ── state helpers ── */
  const refreshCount = () => { fabCount.textContent = load().length; };
  const setMode = (next) => {
    mode = next;
    document.body.classList.toggle('review-on', mode === 'annotate');
    fabAnno.textContent = mode === 'annotate' ? 'Cancel' : '+ Add note';
    fabAnno.classList.toggle('is-on', mode === 'annotate');
    if (mode === 'off') hideTip();
  };

  /* ── describe clicked location ── */
  function describeLocation(el) {
    if (!el) return '';
    const page = (document.title.split('·')[0] || document.title).trim();

    // Identify the surrounding region
    let region = '';
    if (el.closest('.site-header')) region = 'Header / Nav';
    else if (el.closest('.site-footer')) region = 'Footer';
    else if (el.closest('.home-hero')) region = 'Hero';
    else if (el.closest('.pi-card')) region = 'PI card';
    else {
      const sec = el.closest('.home-section, .page-head, .people-section, section');
      if (sec) {
        const h = sec.querySelector('.section-title h2, .page-head h1, h2, h3');
        if (h) region = h.textContent.trim();
      }
    }

    // Get a short quote of the clicked element
    let text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (text.length > 100) text = text.slice(0, 100) + '…';

    const parts = [page];
    if (region) parts.push(region);
    if (text) parts.push(`"${text}"`);
    return parts.join(' › ');
  }

  /* ── tip ── */
  function showTip(x, y) {
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 160, x))}px`;
    tip.style.top  = `${Math.max(8, Math.min(window.innerHeight - 50, y))}px`;
    tip.hidden = false;
  }
  function hideTip() { tip.hidden = true; }

  /* ── modal ── */
  function openModal(target) {
    placeIn.value = describeLocation(target);
    suggIn.value  = '';
    backdrop.hidden = false;
    setTimeout(() => suggIn.focus(), 30);
  }
  function closeModal() { backdrop.hidden = true; }

  /* ── panel ── */
  function openPanel() { renderList(); panel.hidden = false; }
  function closePanel() { panel.hidden = true; }

  function renderList() {
    const arr = load();
    if (!arr.length) {
      listEl.innerHTML = '<p class="review-empty">No notes yet. Click <em>+ Add note</em>, then click anywhere on the page.</p>';
      return;
    }
    const byPage = arr.reduce((acc, c) => {
      const k = c.page || '/';
      (acc[k] = acc[k] || []).push(c);
      return acc;
    }, {});
    listEl.innerHTML = Object.entries(byPage).map(([page, items]) => `
      <div class="review-group">
        <h4>${esc(page)}</h4>
        <ul>${items.map(c => `
          <li>
            <div class="review-place">${esc(c.place)}</div>
            <div class="review-suggestion">${esc(c.suggestion)}</div>
            <div class="review-row-meta">
              <span>${new Date(c.ts).toLocaleString()}</span>
              <button data-id="${c.id}" class="review-del" type="button">delete</button>
            </div>
          </li>`).join('')}
        </ul>
      </div>`).join('');
    listEl.querySelectorAll('.review-del').forEach(btn => {
      btn.addEventListener('click', () => {
        del(Number(btn.dataset.id));
        renderList();
        refreshCount();
      });
    });
  }

  /* ── export ── */
  function toClaudePrompt(arr) {
    const pages = new Set(arr.map(c => c.page));
    const lines = [
      `Please update the Huang Lab website based on the following review comments from the advisor.`,
      `There are ${arr.length} comment(s) across ${pages.size} page(s). The site is a static multi-page HTML/CSS project in the current directory.`,
      ``,
      `=== REVIEW COMMENTS ===`,
      ``,
    ];
    arr.forEach((c, i) => {
      lines.push(`[${i + 1}] Page: ${c.page}`);
      lines.push(`    Location: ${c.place}`);
      lines.push(`    Suggestion: ${c.suggestion.replace(/\n/g, '\n                ')}`);
      lines.push('');
    });
    lines.push(`Please apply each suggestion to the relevant page. After making the changes, summarise what you updated and any items you skipped or need clarification on.`);
    return lines.join('\n');
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function toMarkdown(arr) {
    const lines = [
      `# Huang Lab Website — Review Notes`,
      `Exported: ${new Date().toLocaleString()}`,
      `Total notes: ${arr.length}`,
      ``,
    ];
    const byPage = arr.reduce((acc, c) => {
      const k = c.page || '/';
      (acc[k] = acc[k] || []).push(c);
      return acc;
    }, {});
    Object.entries(byPage).forEach(([page, items]) => {
      lines.push(`## ${page}`, '');
      items.forEach((c, i) => {
        lines.push(`### ${i + 1}. ${c.place}`);
        lines.push('');
        lines.push(c.suggestion.split('\n').map(l => `> ${l}`).join('\n'));
        lines.push('', `*Added ${new Date(c.ts).toLocaleString()}*`, '');
      });
    });
    return lines.join('\n');
  }
  function download(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ── event wiring ── */
  fabAnno.addEventListener('click', () => setMode(mode === 'annotate' ? 'off' : 'annotate'));
  fabView.addEventListener('click', openPanel);
  $('reviewFabHide').addEventListener('click', () => {
    if (confirm('Hide the review tool?\n\nTo bring it back later, open the site with "?review=on" at the end of the URL.')) {
      localStorage.setItem(HIDDEN_KEY, '1');
      root.remove();
    }
  });

  // Capture clicks on the page while in annotate mode
  document.addEventListener('click', (e) => {
    if (mode !== 'annotate') return;
    if (e.target.closest('.review-ui')) return;
    e.preventDefault();
    e.stopPropagation();
    lastTarget = e.target;
    showTip(e.clientX + 6, e.clientY + 6);
  }, true);

  tipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTip();
    openModal(lastTarget);
  });

  // Dismiss tip if clicking outside in annotate mode happens elsewhere (handled by the capture above)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!backdrop.hidden) closeModal();
      else if (mode === 'annotate') setMode('off');
      else if (!panel.hidden) closePanel();
    }
  });

  $('reviewCancel').addEventListener('click', closeModal);
  modal.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!placeIn.value.trim() || !suggIn.value.trim()) return;
    add({
      place: placeIn.value.trim(),
      suggestion: suggIn.value.trim(),
      page: location.pathname.split('/').pop() || 'index.html',
    });
    closeModal();
    setMode('off');
    refreshCount();
  });

  $('reviewPanelClose').addEventListener('click', closePanel);
  $('reviewCopyPrompt').addEventListener('click', async () => {
    const arr = load();
    if (!arr.length) return alert('No notes to copy.');
    const ok = await copyToClipboard(toClaudePrompt(arr));
    const btn = $('reviewCopyPrompt');
    const original = btn.textContent;
    btn.textContent = ok ? '✓ Copied to clipboard' : 'Copy failed — use Export Markdown';
    setTimeout(() => { btn.textContent = original; }, 2200);
  });
  $('reviewExportMd').addEventListener('click', () => {
    const arr = load();
    if (!arr.length) return alert('No notes to export.');
    download(toMarkdown(arr), 'text/markdown', `huang-lab-review-${stamp()}.md`);
  });
  $('reviewExportJson').addEventListener('click', () => {
    const arr = load();
    if (!arr.length) return alert('No notes to export.');
    download(JSON.stringify(arr, null, 2), 'application/json', `huang-lab-review-${stamp()}.json`);
  });
  $('reviewClear').addEventListener('click', () => {
    if (!load().length) return;
    if (confirm('Clear all review notes? This cannot be undone.')) {
      clr(); renderList(); refreshCount();
    }
  });

  /* ── utils ── */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  refreshCount();
})();
