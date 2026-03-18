/**
 * NodeFeeds Enhanced Transitions
 * Uses the View Transitions API (SPA-lite style) for smooth, high-performance navigation
 */

(function() {
  if (!document.startViewTransition) return; // Fallback to standard navigation

  window.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const url = new URL(link.href);
    if (url.origin !== location.origin) return; // Only same-origin
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // Standard browser behavior for modified clicks
    if (link.getAttribute('target') === '_blank') return;
    if (link.hasAttribute('download')) return;

    // Skip if it's the same URL (just a hash or same path)
    if (url.pathname === location.pathname && url.search === location.search) return;

    e.preventDefault();
    navigate(url);
  });

  window.addEventListener('popstate', () => {
    navigate(new URL(location.href), true);
  });

  async function navigate(url, isPopState = false) {
    try {
      const response = await fetch(url.href);
      if (!response.ok) {
        if (!isPopState) location.href = url.href;
        return;
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const newMain = doc.querySelector('main');
      const newTitle = doc.title;
      const newNav = doc.querySelector('nav');
      const newHeaderTicker = doc.querySelector('.header-ticker-inner');
      const newSideCol = doc.querySelector('.side-col');

      if (!newMain) {
        if (!isPopState) location.href = url.href;
        return;
      }

      // Start the transition
      const transition = document.startViewTransition(() => {
        // Update URL and Title
        if (!isPopState) history.pushState({}, '', url.href);
        document.title = newTitle;

        // Swap Content
        const currentMain = document.querySelector('main');
        if (currentMain) currentMain.replaceWith(newMain);

        const currentSideCol = document.querySelector('.side-col');
        if (currentSideCol && newSideCol) currentSideCol.replaceWith(newSideCol);

        // Update Navigation for active state
        const currentNav = document.querySelector('nav');
        if (currentNav && newNav) {
           currentNav.replaceWith(newNav);
        }

        // Optionally update the ticker if it changed significantly
        const currentHeaderTicker = document.querySelector('.header-ticker-inner');
        if (currentHeaderTicker && newHeaderTicker) {
           currentHeaderTicker.replaceWith(newHeaderTicker);
        }

        // Scroll to top
        window.scrollTo(0, 0);

        // Re-initialize any scripts if necessary (e.g., progress bar, reactions)
        reinitScripts();
      });

    } catch (err) {
      console.error('Transition failed:', err);
      if (!isPopState) location.href = url.href;
    }
  }

  function reinitScripts() {
    // Re-initialize progress bar logic if on an article page
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      window.removeEventListener('scroll', updateProgressBar);
      window.addEventListener('scroll', updateProgressBar);
    }

    // Re-load reactions if present
    const reactions = document.getElementById('reactions');
    if (reactions) {
       // The logic in server.js script tags will need to be re-run or abstracted.
       // For now, we'll let the standard script tags in the fetched HTML handle it if they execute.
       // Note: DOMParser doesn't execute scripts. We might need to manually run them.
       const scripts = document.querySelectorAll('main script');
       scripts.forEach(oldScript => {
         const newScript = document.createElement('script');
         Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
         newScript.appendChild(document.createTextNode(oldScript.innerHTML));
         oldScript.parentNode.replaceChild(newScript, oldScript);
       });
    }
  }

  function updateProgressBar() {
    const el = document.documentElement;
    const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = Math.min(pct, 100) + '%';
  }
})();
