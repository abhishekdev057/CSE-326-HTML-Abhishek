/* ==========================================================================
   Barterly — Theme bootstrap
   Loaded synchronously in <head> so the saved theme is applied before the
   first paint (no light/dark flash).
   • Nothing saved yet ⇒ follow the operating system ("system").
   • Saved "light" / "dark" / "system" ⇒ use it. Saved accent ⇒ use it.
   ========================================================================== */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var mode = localStorage.getItem('ss-theme');
    var accent = localStorage.getItem('ss-accent');
    var theme = mode === 'light' || mode === 'dark'
      ? mode
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', theme);
    if (accent && accent !== 'barterly') root.setAttribute('data-accent', accent);
  } catch (e) {
    /* Storage blocked: the CSS media-query fallback follows the OS preference. */
  }
})();
