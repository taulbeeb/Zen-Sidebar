// ==UserScript==
// @name           Zen Sidebar - Web Panels
// @description    Vivaldi/Edge-style web panel sidebar for Zen Browser
// @version        1.0.0
// @author         Zen Sidebar Contributors
// @include        main
// @startup        UC.zenSidebar.init(win)
// @shutdown       UC.zenSidebar.destroy(win)
// ==/UserScript==

import { ZenSidebar } from "./zen_sidebar/sidebar.mjs";

UC.zenSidebar = {
  instances: new WeakMap(),

  init(win) {
    const sidebar = new ZenSidebar(win);
    this.instances.set(win, sidebar);
    sidebar.init();
  },

  destroy(win) {
    const sidebar = this.instances.get(win);
    if (sidebar) {
      sidebar.destroy();
      this.instances.delete(win);
    }
  },
};
