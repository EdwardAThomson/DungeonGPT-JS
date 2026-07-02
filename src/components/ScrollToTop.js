// ScrollToTop.js
// React Router's BrowserRouter does not reset scroll on navigation, so following a
// link at the bottom of one page (e.g. Getting Started -> Features & FAQ) landed the
// player partway down the destination. On every path change we scroll the window to
// the top; if the new location carries a hash we scroll to that anchor instead so
// deliberate in-page links keep working. Renders nothing.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
