/* ─────────────────────────────────────────────
   Password gate (soft, client-side)
   - Password: "penn"
   - Stored in sessionStorage (clears when the browser
     closes; persists across navigation between pages)
   - URL bypass: any page with ?key=penn pre-authenticates
   ───────────────────────────────────────────── */

(() => {
  const KEY = 'huang_lab_authed_v1';

  // URL bypass: e.g. index.html?key=penn  → grants access immediately
  const params = new URLSearchParams(location.search);
  if (params.get('key') === 'penn') {
    sessionStorage.setItem(KEY, '1');
  }

  if (sessionStorage.getItem(KEY) === '1') return;

  // Hide page content until the gate is mounted
  const hideStyle = document.createElement('style');
  hideStyle.id = 'gate-hide';
  hideStyle.textContent = 'html{visibility:hidden}';
  document.head.appendChild(hideStyle);

  const setup = () => {
    const gateStyle = document.createElement('style');
    gateStyle.id = 'gate-styles';
    gateStyle.textContent = `
      #huangGate {
        position: fixed; inset: 0;
        z-index: 9999;
        background: #ffffff;
        display: grid; place-items: center;
        padding: 24px;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        color: #1a1a1a;
      }
      .gate-card { width: 100%; max-width: 380px; text-align: center; }
      .gate-mark {
        width: 40px; height: 48px;
        margin: 0 auto 24px;
        background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 28'><path d='M12 1.5 L21.5 4.5 V14 C21.5 20 17 25 12 26.5 C7 25 2.5 20 2.5 14 V4.5 Z' fill='%23990000'/><path d='M6.5 17 L12 11 L17.5 17' stroke='%23fff' stroke-width='2.2' fill='none' stroke-linejoin='round' stroke-linecap='round'/></svg>") no-repeat center/contain;
      }
      .gate-card h1 {
        font-family: "Source Serif 4", "Source Serif Pro", Georgia, serif;
        font-weight: 400;
        font-size: 28px;
        letter-spacing: -0.015em;
        margin: 0 0 10px;
      }
      .gate-card p {
        color: #5a5a5a;
        font-size: 15px;
        line-height: 1.5;
        margin: 0 0 26px;
      }
      #gateForm { display: flex; gap: 8px; max-width: 340px; margin: 0 auto; }
      #gateInput {
        flex: 1;
        padding: 10px 14px;
        font-size: 15px;
        font-family: inherit;
        color: #1a1a1a;
        background: #fff;
        border: 1px solid #e6e3dd;
        border-radius: 4px;
        outline: none;
        transition: border-color 0.2s ease;
      }
      #gateInput:focus { border-color: #990000; }
      #gateForm button {
        font-family: inherit;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        color: #fff;
        background: #990000;
        border: 1px solid #990000;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }
      #gateForm button:hover { background: #b8252a; }
      .gate-error {
        color: #990000;
        font-size: 13px;
        margin: 16px 0 0;
      }
      #huangGate [hidden] { display: none !important; }
    `;
    document.head.appendChild(gateStyle);

    const overlay = document.createElement('div');
    overlay.id = 'huangGate';
    overlay.innerHTML = `
      <div class="gate-card">
        <div class="gate-mark" aria-hidden="true"></div>
        <h1>Huang Lab</h1>
        <p>This site is private.<br>Please enter the password to continue.</p>
        <form id="gateForm" autocomplete="off">
          <input type="password" id="gateInput" placeholder="Password" aria-label="Password">
          <button type="submit">Enter</button>
        </form>
        <p class="gate-error" id="gateError" hidden>Incorrect password.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Reveal the (gated) page so the overlay isn't sitting on a blank doc
    hideStyle.remove();

    const input  = document.getElementById('gateInput');
    const errEl  = document.getElementById('gateError');
    const form   = document.getElementById('gateForm');

    setTimeout(() => input.focus(), 50);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim().toLowerCase() === 'penn') {
        sessionStorage.setItem(KEY, '1');
        overlay.remove();
        gateStyle.remove();
        document.body.style.overflow = '';
      } else {
        errEl.hidden = false;
        input.select();
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
