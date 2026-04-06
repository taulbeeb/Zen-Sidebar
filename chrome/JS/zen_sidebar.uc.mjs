// ==UserScript==
// @name           Zen Sidebar - Web Panels
// @description    Vivaldi/Edge-style web panel sidebar for Zen Browser
// @version        1.0.0
// @author         Zen Sidebar Contributors
// ==/UserScript==

import { ZenSidebar } from "./zen_sidebar/sidebar.mjs";

(function () {
  // Wait for the main browser window DOM to be ready
  function initSidebar() {
    const win = window;
    if (!win.document || !win.document.getElementById("browser")) {
      // Not the main browser window, bail
      return;
    }
    const sidebar = new ZenSidebar(win);
    sidebar.init();

    // Clean up on window close
    win.addEventListener(
      "unload",
      () => {
        sidebar.destroy();
      },
      { once: true }
    );
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    initSidebar();
  } else {
    document.addEventListener("DOMContentLoaded", initSidebar, { once: true });
  }
})();
