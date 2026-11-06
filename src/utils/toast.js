// A tiny imperative toast for rewards: works on any screen without threading state through the app. Auto-dismisses; never throws.
export function showRewardToast(lines, ms = 5200) {
  try {
    if (typeof document === 'undefined' || !lines?.length) return;
    let host = document.getElementById('reward-toasts');
    if (!host) { host = document.createElement('div'); host.id = 'reward-toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const el = document.createElement('div'); el.className = 'reward-toast';
    for (const [i, text] of lines.entries()) { const row = document.createElement(i === 0 ? 'strong' : 'span'); row.textContent = text; el.appendChild(row); }
    host.appendChild(el);
    window.setTimeout(() => { el.classList.add('out'); window.setTimeout(() => el.remove(), 400); }, ms);
  } catch { /* decorative only */ }
}
