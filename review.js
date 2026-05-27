/* ─────────────────────────────────────────────
   Review / Annotation tool
   For mentor walkthroughs. Captures comments tied
   to clicked locations and exports as Markdown/JSON.

   Comments are stored in a SHARED Supabase table so
   that everyone's notes are visible to everyone (and
   to you). localStorage is kept only as an offline
   cache + fallback when the backend is unreachable.
   ───────────────────────────────────────────── */

(() => {
  /* ════════════════════════════════════════════
     CONFIG — fill these in once.
     1. Create a free project at https://supabase.com
     2. SQL editor → run the schema in SETUP.md
     3. Project Settings → API → copy the values below.
     The anon key is a PUBLIC key (safe to commit); the
     table is protected by Row Level Security policies.
     ════════════════════════════════════════════ */
  const CONFIG = {
    supabaseUrl:     'https://peiebyowwshykuxorrof.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlaWVieW93d3NoeWt1eG9ycm9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDY1NjEsImV4cCI6MjA5NTQyMjU2MX0.6RPlpNlgbGVGMrMf5w79ROX6w-JRzSntsTIrTBoL6lU',
    table:           'review_notes',
    pollMs:          15000, // how often to re-fetch shared notes
  };

  const STORAGE_KEY = 'huang_lab_review_notes_v1';
  const HIDDEN_KEY  = 'huang_lab_review_hidden_v1';
  const AUTHOR_KEY   = 'huang_lab_review_author_v1';
  const PENDING_KEY  = 'huang_lab_review_pending_v1';
  const MIGRATED_KEY = 'huang_lab_review_migrated_v1';

  const remoteEnabled =
    /^https:\/\/.+\.supabase\.co\/?$/.test(CONFIG.supabaseUrl) &&
    CONFIG.supabaseAnonKey &&
    !CONFIG.supabaseAnonKey.startsWith('YOUR_');

  const restUrl  = `${CONFIG.supabaseUrl.replace(/\/$/, '')}/rest/v1/${CONFIG.table}`;
  const sbHeaders = (extra = {}) => ({
    apikey: CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  });

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

  /* ── local cache (offline view + fallback) ── */
  const loadLocal = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  };
  const saveLocal = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));

  /* ── pending queue: notes added while the backend was
     unreachable, retried on the next successful sync. ── */
  const loadPending = () => {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
    catch { return []; }
  };
  const savePending = (arr) => localStorage.setItem(PENDING_KEY, JSON.stringify(arr));

  /* ── one-time migration ──
     Before this version, notes lived only in each browser's
     localStorage. On the first load after the upgrade, queue any
     such pre-existing notes so they get pushed to the shared store
     instead of being wiped by the first remote fetch. */
  function migrateLegacyLocal() {
    if (!remoteEnabled || localStorage.getItem(MIGRATED_KEY)) return;
    const legacy = loadLocal();
    if (legacy.length) {
      const queued = legacy.map(n => ({
        id: 'local-mig-' + Math.random().toString(36).slice(2),
        author: n.author || '',
        place: n.place || '',
        suggestion: n.suggestion || '',
        page: n.page || 'index.html',
        ts: n.ts || new Date().toISOString(),
      }));
      savePending(loadPending().concat(queued));
    }
    localStorage.setItem(MIGRATED_KEY, '1');
  }

  /* In-memory view of all notes. Kept in sync with the
     backend; renders read from here so the UI stays fast. */
  let notes = loadLocal();
  let status = remoteEnabled ? 'connecting' : 'local'; // connecting | synced | offline | local

  /* ── remote (Supabase REST) ── */
  async function fetchRemote() {
    const res = await fetch(`${restUrl}?select=*&order=ts.asc`, { headers: sbHeaders() });
    if (!res.ok) throw new Error(`Supabase GET ${res.status}: ${await res.text()}`);
    return res.json();
  }
  async function addRemote(c) {
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ page: c.page, place: c.place, suggestion: c.suggestion, author: c.author || null }),
    });
    if (!res.ok) throw new Error(`Supabase POST ${res.status}: ${await res.text()}`);
    return (await res.json())[0];
  }
  async function delRemote(id) {
    const res = await fetch(`${restUrl}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders() });
    if (!res.ok) throw new Error(`Supabase DELETE ${res.status}: ${await res.text()}`);
  }
  async function clrRemote() {
    // PostgREST refuses an unfiltered delete; match every real (uuid) row.
    const res = await fetch(`${restUrl}?id=neq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE', headers: sbHeaders() });
    if (!res.ok) throw new Error(`Supabase DELETE-all ${res.status}: ${await res.text()}`);
  }

  /* ── sync: pull shared notes into the local view ── */
  let syncing = false;
  async function flushPending() {
    const pending = loadPending();
    if (!pending.length) return;
    const remaining = [];
    for (const n of pending) {
      try { await addRemote(n); }
      catch { remaining.push(n); } // keep for the next attempt
    }
    savePending(remaining);
  }
  async function sync({ quiet = false } = {}) {
    if (!remoteEnabled) { notes = loadLocal(); status = 'local'; afterSync(); return; }
    if (syncing) return;
    syncing = true;
    if (!quiet) { status = notes.length ? status : 'connecting'; updateStatus(); }
    try {
      await flushPending();
      const remote = await fetchRemote();
      const pending = loadPending();           // anything still un-pushed
      notes = remote.concat(pending);          // keep showing the user's own
      saveLocal(notes);                         // cache for offline viewing
      status = pending.length ? 'offline' : 'synced';
    } catch (err) {
      console.warn('[review] sync failed, showing cached notes:', err);
      notes = loadLocal();   // fall back to last known good
      status = 'offline';
    } finally {
      syncing = false;
      afterSync();
    }
  }
  function afterSync() {
    refreshCount();
    if (panel && !panel.hidden) renderList();
    updateStatus();
  }

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
          <span>Your name</span>
          <input type="text" id="reviewAuthor" placeholder="e.g. Dr. Huang" required>
          <small>Shown next to your comment so people know who left it. Remembered on this device.</small>
        </label>
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
        <div class="review-head-titles">
          <h3>Review notes</h3>
          <span class="review-sync-status" id="reviewStatus"></span>
        </div>
        <div class="review-head-actions">
          <button type="button" id="reviewRefresh" aria-label="Refresh" title="Refresh">⟳</button>
          <button type="button" id="reviewPanelClose" aria-label="Close">×</button>
        </div>
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
  const authorIn = $('reviewAuthor');
  const placeIn  = $('reviewPlace');
  const suggIn   = $('reviewSuggestion');
  const panel    = $('reviewPanel');
  const listEl   = $('reviewList');
  const statusEl = $('reviewStatus');

  let mode = 'off';        // 'off' | 'annotate'
  let lastTarget = null;

  /* ── state helpers ── */
  const refreshCount = () => { fabCount.textContent = notes.length; };
  const setMode = (next) => {
    mode = next;
    document.body.classList.toggle('review-on', mode === 'annotate');
    fabAnno.textContent = mode === 'annotate' ? 'Cancel' : '+ Add note';
    fabAnno.classList.toggle('is-on', mode === 'annotate');
    if (mode === 'off') hideTip();
  };
  function updateStatus() {
    if (!statusEl) return;
    const map = {
      connecting: { t: 'Connecting…',          c: 'is-pending' },
      synced:     { t: 'Synced — shared',       c: 'is-ok' },
      offline:    { t: 'Offline — cached only',  c: 'is-warn' },
      local:      { t: 'Local only (not set up)', c: 'is-warn' },
    };
    const s = map[status] || map.local;
    statusEl.textContent = s.t;
    statusEl.className = `review-sync-status ${s.c}`;
  }

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
    authorIn.value = localStorage.getItem(AUTHOR_KEY) || '';
    placeIn.value  = describeLocation(target);
    suggIn.value   = '';
    backdrop.hidden = false;
    setTimeout(() => (authorIn.value ? suggIn : authorIn).focus(), 30);
  }
  function closeModal() { backdrop.hidden = true; }

  /* ── panel ── */
  function openPanel() { renderList(); panel.hidden = false; sync(); }
  function closePanel() { panel.hidden = true; }

  function renderList() {
    const arr = notes;
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
              <span>${c.author ? esc(c.author) + ' · ' : ''}${c.ts ? new Date(c.ts).toLocaleString() : ''}</span>
              <button data-id="${esc(c.id)}" class="review-del" type="button">delete</button>
            </div>
          </li>`).join('')}
        </ul>
      </div>`).join('');
    listEl.querySelectorAll('.review-del').forEach(btn => {
      btn.addEventListener('click', () => removeNote(btn.dataset.id));
    });
  }

  async function removeNote(id) {
    if (String(id).startsWith('local-')) {
      // Never pushed yet — drop it from the retry queue so it can't resurrect.
      savePending(loadPending().filter(n => String(n.id) !== String(id)));
    } else if (remoteEnabled) {
      try { await delRemote(id); }
      catch (err) { alert('Could not delete from the shared store. Check your connection and try again.'); console.warn(err); return; }
    }
    notes = notes.filter(c => String(c.id) !== String(id));
    saveLocal(notes);
    renderList();
    refreshCount();
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
      if (c.author) lines.push(`    From: ${c.author}`);
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
        const meta = [c.author, c.ts ? new Date(c.ts).toLocaleString() : null].filter(Boolean).join(' · ');
        lines.push('', `*${meta ? meta : 'Added'}*`, '');
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
      clearInterval(pollTimer);
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!backdrop.hidden) closeModal();
      else if (mode === 'annotate') setMode('off');
      else if (!panel.hidden) closePanel();
    }
  });

  $('reviewCancel').addEventListener('click', closeModal);
  modal.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author     = authorIn.value.trim();
    const place      = placeIn.value.trim();
    const suggestion = suggIn.value.trim();
    if (!place || !suggestion) return;
    if (author) localStorage.setItem(AUTHOR_KEY, author);

    const note = {
      id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      author, place, suggestion,
      page: location.pathname.split('/').pop() || 'index.html',
      ts: new Date().toISOString(),
    };

    // Optimistic local insert so the UI feels instant.
    notes.push(note);
    saveLocal(notes);
    refreshCount();
    closeModal();
    setMode('off');

    if (remoteEnabled) {
      try { await addRemote(note); await sync({ quiet: true }); }
      catch (err) {
        console.warn(err);
        savePending(loadPending().concat(note)); // retry on next sync
        status = 'offline'; updateStatus();
        alert('Saved on this device. The shared store was unreachable, so others can\'t see it yet — it will retry automatically the next time the tool connects.');
      }
    }
  });

  $('reviewPanelClose').addEventListener('click', closePanel);
  $('reviewRefresh').addEventListener('click', () => sync());
  $('reviewCopyPrompt').addEventListener('click', async () => {
    if (!notes.length) return alert('No notes to copy.');
    const ok = await copyToClipboard(toClaudePrompt(notes));
    const btn = $('reviewCopyPrompt');
    const original = btn.textContent;
    btn.textContent = ok ? '✓ Copied to clipboard' : 'Copy failed — use Export Markdown';
    setTimeout(() => { btn.textContent = original; }, 2200);
  });
  $('reviewExportMd').addEventListener('click', () => {
    if (!notes.length) return alert('No notes to export.');
    download(toMarkdown(notes), 'text/markdown', `huang-lab-review-${stamp()}.md`);
  });
  $('reviewExportJson').addEventListener('click', () => {
    if (!notes.length) return alert('No notes to export.');
    download(JSON.stringify(notes, null, 2), 'application/json', `huang-lab-review-${stamp()}.json`);
  });
  $('reviewClear').addEventListener('click', async () => {
    if (!notes.length) return;
    const msg = remoteEnabled
      ? 'Clear ALL review notes for EVERYONE? This deletes them from the shared store and cannot be undone.'
      : 'Clear all review notes? This cannot be undone.';
    if (!confirm(msg)) return;
    if (remoteEnabled) {
      try { await clrRemote(); }
      catch (err) { alert('Could not clear the shared store. Check your connection.'); console.warn(err); return; }
    }
    notes = [];
    savePending([]);
    saveLocal(notes);
    renderList();
    refreshCount();
  });

  /* ── utils ── */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  /* ── boot ── */
  migrateLegacyLocal();
  refreshCount();
  updateStatus();
  sync();

  // Keep the shared notes fresh: poll while the tab is visible.
  let pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') sync({ quiet: true });
  }, CONFIG.pollMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync({ quiet: true });
  });
})();
