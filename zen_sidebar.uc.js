// ==UserScript==
// @name           Zen Sidebar - Web Panels
// @description    Vivaldi/Edge-style web panel sidebar for Zen Browser
// @version        1.0.0
// @author         Zen Sidebar Contributors
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════
  // WebPanel
  // ═══════════════════════════════════════════════════════════════

class WebPanel {
  constructor(sidebar, { id, url, label, icon, userContextId = 0, showToolbar = true, width = 0, mobileUA = true,
    zoom = 1.0, muted = false, loadOnStartup = true, unloadOnClose = false,
    autoReloadInterval = 0, keybinding = "",
    dynamicTitle = true, dynamicFavicon = true, customTitle = "", customIcon = "",
    cssSelector = "", tooltipMode = "title", unloadTimer = 0 }) {
    this.sidebar = sidebar;
    this.id = id;
    this.url = url;
    this.label = label;
    this.icon = icon;
    this.userContextId = userContextId;
    this.showToolbar = showToolbar;
    this.width = width;
    this.mobileUA = mobileUA;
    // Phase 0: new fields
    this.zoom = zoom;
    this.muted = muted;
    this.loadOnStartup = loadOnStartup;
    this.unloadOnClose = unloadOnClose;
    this.autoReloadInterval = autoReloadInterval;
    this.keybinding = keybinding;
    this.dynamicTitle = dynamicTitle;
    this.dynamicFavicon = dynamicFavicon;
    this.customTitle = customTitle;
    this.customIcon = customIcon;
    this.cssSelector = cssSelector;
    this.tooltipMode = tooltipMode;
    this.unloadTimer = unloadTimer; // minutes before inactive panel is unloaded (0 = never)
    this._browser = null;
    this._loaded = false;
    this._unloadTimerId = null;
  }

  createBrowser() {
    const doc = this.sidebar.doc;
    const container = this.sidebar._panelContainer;

    this._browser = doc.createXULElement("browser");
    this._browser.setAttribute("id", this.id);
    this._browser.setAttribute("type", "content");
    this._browser.setAttribute("remote", "true");
    this._browser.setAttribute("disableglobalhistory", "true");
    this._browser.setAttribute("messagemanagergroup", "webext-browsers");
    this._browser.setAttribute("webextension-view-type", "sidebar");
    this._browser.setAttribute("class", "zen-sidebar-web-panel-browser");
    this._browser.setAttribute("flex", "1");
    this._browser.setAttribute("context", "contentAreaContextMenu");
    this._browser.setAttribute("tooltip", "aHTMLTooltip");
    this._browser.setAttribute("autocompletepopup", "PopupAutoComplete");
    this._browser.style.display = "none";

    if (this.userContextId > 0) {
      this._browser.setAttribute("usercontextid", String(this.userContextId));
    }

    if (this.mobileUA !== false) {
      this._browser.setAttribute(
        "useragent",
        "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      );
    }

    container.appendChild(this._browser);
    // Apply mute state and attach listeners
    if (this.muted) {
      try { this._browser.audioMuted = true; } catch {}
    }
    this.attachBrowserListeners();
  }

  load() {
    if (!this._browser || this._loaded) return;
    this._browser.setAttribute("src", this.url);
    this._loaded = true;
    this._applyCSSSelector();
  }

  _applyCSSSelector() {
    if (!this._browser || !this.cssSelector) return;
    const sel = this.cssSelector.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
    try {
      this._browser.messageManager.loadFrameScript(`data:,
        addEventListener("DOMContentLoaded", function() {
          try {
            var s = content.document.createElement("style");
            s.textContent = "body > *:not(${sel}):not(:has(${sel})) { display: none !important; } ${sel} { display: block !important; position: relative !important; width: 100% !important; min-height: 100vh !important; margin: 0 !important; padding: 8px !important; box-sizing: border-box !important; }";
            s.id = "zen-sidebar-css-extract";
            var old = content.document.getElementById("zen-sidebar-css-extract");
            if (old) old.remove();
            content.document.head.appendChild(s);
          } catch(e) {}
        }, true);
      `, true);
    } catch {}
  }

  reload() {
    if (!this._browser) return;
    this._browser.setAttribute("src", this.url);
    this._loaded = true;
  }

  show() {
    this.ensureBrowser();
    if (!this._browser) return;
    this.load();
    this._browser.style.display = "";
    this._applyZoom();
  }

  hide() {
    if (!this._browser) return;
    this._browser.style.display = "none";
  }

  // ── Memory Management ─────────────────────────────────────────

  ensureBrowser() {
    if (!this._browser) {
      this.createBrowser();
    }
  }

  unload() {
    this.detachBrowserListeners();
    if (this._browser) {
      this._browser.remove();
      this._browser = null;
      this._loaded = false;
    }
  }

  get isLoaded() { return !!this._browser; }

  // ── Zoom ──────────────────────────────────────────────────────

  _applyZoom() {
    if (this._browser && this.zoom !== 1.0) {
      try { this._browser.fullZoom = this.zoom; } catch {}
    }
  }

  setZoom(level) {
    this.zoom = Math.max(0.3, Math.min(3.0, level));
    if (this._browser) {
      try { this._browser.fullZoom = this.zoom; } catch {}
    }
    this.sidebar.panelManager.save();
  }

  zoomIn() { this.setZoom((this.zoom || 1.0) + 0.1); }
  zoomOut() { this.setZoom((this.zoom || 1.0) - 0.1); }
  resetZoom() { this.setZoom(1.0); }

  // ── Dynamic Title / Favicon / Audio / Notifications ───────────

  attachBrowserListeners() {
    if (!this._browser) return;
    this._onTitleChanged = () => {
      const title = this._browser.contentTitle || "";
      // Update label if dynamic and no custom override
      if (this.dynamicTitle && !this.customTitle && title) {
        this.label = title;
        this.sidebar.toolbar.updateIcon(this);
      }
      // Parse notification badge from title
      this._parseBadge(title);
    };
    this._onLinkAdded = (e) => {
      if (!this.dynamicFavicon || this.customIcon) return;
      const link = e.originalTarget;
      if (link && link.rel && /icon/i.test(link.rel) && link.href) {
        this.icon = link.href;
        this.sidebar.toolbar.updateIcon(this);
      }
    };
    // Audio detection: poll browser.audioPlaybackActive since the soundplaying
    // attribute and DOMAudioPlayback events are managed by tabbrowser and don't
    // fire on standalone <browser> elements outside the tab strip.
    this._audioPlaying = false;

    this._browser.addEventListener("pagetitlechanged", this._onTitleChanged);
    this._browser.addEventListener("DOMLinkAdded", this._onLinkAdded);
  }

  detachBrowserListeners() {
    if (!this._browser) return;
    if (this._onTitleChanged) this._browser.removeEventListener("pagetitlechanged", this._onTitleChanged);
    if (this._onLinkAdded) this._browser.removeEventListener("DOMLinkAdded", this._onLinkAdded);
  }

  _parseBadge(title) {
    if (!title) { this._badge = 0; this.sidebar.toolbar.updateBadge(this); return; }
    const m = title.match(/^\((\d+)\)/) || title.match(/^\[(\d+)\]/) || title.match(/^(\d+)\s*[|:]/);
    const count = m ? Math.min(parseInt(m[1], 10), 99) : 0;
    if (count !== this._badge) {
      this._badge = count;
      this.sidebar.toolbar.updateBadge(this);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this._browser) {
      try { this._browser.audioMuted = this.muted; } catch {}
    }
    this.sidebar.toolbar.updateAudioState(this);
    this.sidebar.panelManager.save();
  }

  destroy() {
    this.detachBrowserListeners();
    if (this._browser) {
      this._browser.remove();
      this._browser = null;
    }
  }
}

  // ═══════════════════════════════════════════════════════════════
  // PanelManager
  // ═══════════════════════════════════════════════════════════════


const PREF_PANELS = "zen.sidebar.panels";

class PanelManager {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.panels = [];
    this._activePanel = null;
  }

  get activePanel() { return this._activePanel; }

  // ── Panel CRUD ────────────────────────────────────────────────────

  addPanel(url, label, icon, userContextId = 0, opts = {}) {
    const id = `zen-wp-${Date.now()}`;
    const panel = new WebPanel(this.sidebar, {
      id, url,
      label: label || this._labelFromURL(url),
      icon: icon || this._faviconURL(url),
      userContextId,
      width: opts.width || 0,
      mobileUA: opts.mobileUA !== false,
      zoom: opts.zoom ?? 1.0,
      autoReloadInterval: opts.autoReloadInterval || 0,
      cssSelector: opts.cssSelector || "",
      keybinding: opts.keybinding || "",
      tooltipMode: opts.tooltipMode || "title",
      loadOnStartup: opts.loadOnStartup !== false,
      unloadOnClose: opts.unloadOnClose || false,
      customTitle: opts.customTitle || "",
      customIcon: opts.customIcon || "",
      unloadTimer: opts.unloadTimer || 0,
    });
    this.panels.push(panel);
    panel.createBrowser();
    this.sidebar.toolbar.addIcon(panel);
    this.sidebar.switchToPanel(panel);
    this.save();
    return panel;
  }

  removePanel(panel) {
    const idx = this.panels.indexOf(panel);
    if (idx === -1) return;

    this._stopAutoReload(panel);
    this._stopUnloadTimer(panel);
    panel.destroy();
    this.panels.splice(idx, 1);
    this.sidebar.toolbar.removeIcon(panel);

    if (this._activePanel === panel) {
      this._activePanel = null;
      if (this.panels.length > 0) {
        this.sidebar.switchToPanel(this.panels[Math.min(idx, this.panels.length - 1)]);
      } else {
        this.sidebar.collapsePanel();
      }
    }
    this.save();
  }

  editPanel(panel, url, label, icon, userContextId) {
    if (url) panel.url = url;
    if (label) panel.label = label;
    if (icon) panel.icon = icon;
    if (userContextId !== undefined) {
      const changed = panel.userContextId !== userContextId;
      panel.userContextId = userContextId;
      if (changed) {
        panel.destroy();
        panel.createBrowser();
      }
    }
    panel.reload();
    this.sidebar.toolbar.updateIcon(panel);
    this.save();
  }

  movePanel(panel, direction) {
    const idx = this.panels.indexOf(panel);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this.panels.length) return;
    this.panels.splice(idx, 1);
    this.panels.splice(newIdx, 0, panel);
    this.sidebar.toolbar.rebuild();
    this.save();
  }

  switchTo(panel) {
    if (this._activePanel && this._activePanel !== panel) {
      this._activePanel.hide();
      // Start unload timer for the panel being deactivated
      this._startUnloadTimer(this._activePanel);
    }
    // Stop unload timer for the panel becoming active
    this._stopUnloadTimer(panel);
    this._activePanel = panel;
    panel.show();
    this.sidebar.toolbar.setActive(panel);
  }

  // ── Persistence ───────────────────────────────────────────────────

  save() {
    const data = this.panels.map((p) => ({
      id: p.id, url: p.url, label: p.label, icon: p.icon,
      userContextId: p.userContextId || 0,
      showToolbar: p.showToolbar !== false,
      width: p.width || 0,
      mobileUA: p.mobileUA !== false,
      zoom: p.zoom ?? 1.0,
      muted: p.muted || false,
      loadOnStartup: p.loadOnStartup !== false,
      unloadOnClose: p.unloadOnClose || false,
      autoReloadInterval: p.autoReloadInterval || 0,
      keybinding: p.keybinding || "",
      dynamicTitle: p.dynamicTitle !== false,
      dynamicFavicon: p.dynamicFavicon !== false,
      customTitle: p.customTitle || "",
      customIcon: p.customIcon || "",
      cssSelector: p.cssSelector || "",
      tooltipMode: p.tooltipMode || "title",
      unloadTimer: p.unloadTimer || 0,
    }));
    const activeId = this._activePanel ? this._activePanel.id : null;
    Services.prefs.setStringPref(PREF_PANELS, JSON.stringify({ panels: data, activeId }));
  }

  restore() {
    let json;
    try { json = Services.prefs.getStringPref(PREF_PANELS, ""); } catch { return; }
    if (!json) return;
    let data;
    try { data = JSON.parse(json); } catch { return; }
    if (!data.panels || !Array.isArray(data.panels)) return;

    for (const p of data.panels) {
      const panel = new WebPanel(this.sidebar, {
        id: p.id, url: p.url, label: p.label, icon: p.icon,
        userContextId: p.userContextId || 0,
        showToolbar: p.showToolbar !== false,
        width: p.width || 0,
        mobileUA: p.mobileUA !== false,
        zoom: p.zoom ?? 1.0,
        muted: p.muted || false,
        loadOnStartup: p.loadOnStartup !== false,
        unloadOnClose: p.unloadOnClose || false,
        autoReloadInterval: p.autoReloadInterval || 0,
        keybinding: p.keybinding || "",
        dynamicTitle: p.dynamicTitle !== false,
        dynamicFavicon: p.dynamicFavicon !== false,
        customTitle: p.customTitle || "",
        customIcon: p.customIcon || "",
        cssSelector: p.cssSelector || "",
        tooltipMode: p.tooltipMode || "title",
        unloadTimer: p.unloadTimer || 0,
      });
      this.panels.push(panel);
      if (panel.loadOnStartup) {
        panel.createBrowser();
      }
      this.sidebar.toolbar.addIcon(panel);
      if (!panel.loadOnStartup) {
        this.sidebar.toolbar.updateUnloadedState(panel);
      }
    }

    if (data.activeId) {
      const active = this.panels.find((p) => p.id === data.activeId);
      if (active) {
        this._activePanel = active;
        this.sidebar.toolbar.setActive(active);
      }
    }

    // Start auto-reload timers and unload timers for inactive panels
    for (const panel of this.panels) {
      if (panel.autoReloadInterval > 0 && panel.isLoaded) {
        this._startAutoReload(panel);
      }
      if (panel.unloadTimer > 0 && panel.isLoaded && panel !== this._activePanel) {
        this._startUnloadTimer(panel);
      }
    }
    // Start the shared audio poll
    this._startAudioPoll();
  }

  _startAutoReload(panel) {
    this._stopAutoReload(panel);
    if (panel.autoReloadInterval > 0) {
      panel._autoReloadTimerId = setInterval(() => {
        if (panel._browser) panel._browser.reload();
      }, panel.autoReloadInterval);
    }
  }

  _stopAutoReload(panel) {
    if (panel._autoReloadTimerId) {
      clearInterval(panel._autoReloadTimerId);
      panel._autoReloadTimerId = null;
    }
  }

  // ── Unload Timer (inactive panel memory reclaim) ─────────────────

  _startUnloadTimer(panel) {
    this._stopUnloadTimer(panel);
    if (panel.unloadTimer > 0 && panel.isLoaded) {
      panel._unloadTimerId = setTimeout(() => {
        panel._unloadTimerId = null;
        if (panel.isLoaded && this._activePanel !== panel) {
          panel.unload();
          this.sidebar.toolbar.updateUnloadedState(panel);
        }
      }, panel.unloadTimer * 60 * 1000);
    }
  }

  _stopUnloadTimer(panel) {
    if (panel._unloadTimerId) {
      clearTimeout(panel._unloadTimerId);
      panel._unloadTimerId = null;
    }
  }

  // ── Audio Polling (single shared interval) ───────────────────────

  _startAudioPoll() {
    if (this._audioPollId) return;
    this._audioPollId = setInterval(() => {
      if (this.sidebar.doc.hidden) return; // skip when window is in background
      for (const panel of this.panels) {
        if (!panel._browser || !panel.isLoaded) continue;
        try {
          const playing = !!panel._browser.audioPlaybackActive;
          if (playing !== panel._audioPlaying) {
            panel._audioPlaying = playing;
            this.sidebar.toolbar.updateAudioState(panel);
          }
        } catch {}
      }
    }, 2000);
  }

  _stopAudioPoll() {
    if (this._audioPollId) { clearInterval(this._audioPollId); this._audioPollId = null; }
  }

  // ── Utility ───────────────────────────────────────────────────────

  _labelFromURL(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return url; }
  }

  _faviconURL(url) {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
    catch { return ""; }
  }

  getContainers() {
    try {
      const mod = ChromeUtils.importESModule
        ? ChromeUtils.importESModule("resource://gre/modules/ContextualIdentityService.sys.mjs")
        : ChromeUtils.import("resource://gre/modules/ContextualIdentityService.jsm");
      const svc = mod.ContextualIdentityService || ContextualIdentityService;
      return svc.getPublicIdentities().map((ci) => ({
        userContextId: ci.userContextId,
        name: ContextualIdentityService.getUserContextLabel(ci.userContextId),
        icon: ci.icon, color: ci.color,
      }));
    } catch { return []; }
  }

  getContainerName(userContextId) {
    if (!userContextId) return "No Container";
    const match = this.getContainers().find((c) => c.userContextId === userContextId);
    return match ? match.name : "No Container";
  }
}

  // ═══════════════════════════════════════════════════════════════
  // Toolbar
  // ═══════════════════════════════════════════════════════════════

class Toolbar {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.doc = sidebar.doc;
    this._icons = new Map();
    this._dragState = null;
  }

  build() {
    this._toolbar = this._el("vbox", { id: "zen-sidebar-toolbar" });
    this._iconContainer = this._el("vbox", { id: "zen-sidebar-toolbar-icons", flex: "1" });

    // Add button lives inline, inside the icon container
    this._addBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-add-btn",
      tooltiptext: "Add web panel",
      label: "+",
    });
    this._addBtn.addEventListener("command", () => this.sidebar.showAddPanelForm());
    this._iconContainer.appendChild(this._addBtn);

    this._toolbar.appendChild(this._iconContainer);

    // Settings gear at bottom
    this._settingsBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-settings-btn",
      tooltiptext: "Sidebar Settings",
      image: "chrome://global/skin/icons/settings.svg",
    });
    this._settingsBtn.addEventListener("command", () => {
      this.sidebar.settingsDialog.showSettings(this._settingsBtn);
    });
    this._toolbar.appendChild(this._settingsBtn);

    return this._toolbar;
  }

  // ── Icons ─────────────────────────────────────────────────────────

  addIcon(panel) {
    const btn = this._el("toolbarbutton", {
      class: "zen-sidebar-panel-icon",
      tooltiptext: this._tooltip(panel),
      "data-panel-id": panel.id,
    });
    if (panel.icon) btn.setAttribute("image", panel.icon);
    this._applyContainerColor(btn, panel);

    btn.addEventListener("command", () => this.sidebar.switchToPanel(panel));
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._showContextMenu(e, panel);
    });

    // Drag to reorder
    this._setupDrag(btn, panel);

    this._icons.set(panel.id, btn);
    // Insert before the + button so it stays at the end
    this._iconContainer.insertBefore(btn, this._addBtn);
  }

  removeIcon(panel) {
    const btn = this._icons.get(panel.id);
    if (btn) { btn.remove(); this._icons.delete(panel.id); }
  }

  updateIcon(panel) {
    const btn = this._icons.get(panel.id);
    if (!btn) return;
    btn.setAttribute("tooltiptext", this._tooltip(panel));
    if (panel.icon) btn.setAttribute("image", panel.icon);
    this._applyContainerColor(btn, panel);
  }

  setActive(panel) {
    for (const btn of this._icons.values()) btn.removeAttribute("data-active");
    const btn = this._icons.get(panel.id);
    if (btn) btn.setAttribute("data-active", "true");
  }

  clearActive() {
    for (const btn of this._icons.values()) btn.removeAttribute("data-active");
  }

  updateUnloadedState(panel) {
    const btn = this._icons.get(panel.id);
    if (!btn) return;
    if (!panel.isLoaded) {
      btn.setAttribute("data-unloaded", "true");
    } else {
      btn.removeAttribute("data-unloaded");
    }
  }

  rebuild() {
    // Remove all panel icons but keep the + button
    for (const btn of this._icons.values()) btn.remove();
    this._icons.clear();
    for (const panel of this.sidebar.panelManager.panels) this.addIcon(panel);
    if (this.sidebar.panelManager.activePanel) this.setActive(this.sidebar.panelManager.activePanel);
  }

  // ── Audio & Badge Indicators ───────────────────────────────────────

  updateAudioState(panel) {
    const btn = this._icons.get(panel.id);
    if (!btn) return;
    if (panel._audioPlaying && !panel.muted) {
      btn.setAttribute("data-audio", "playing");
    } else if (panel.muted) {
      btn.setAttribute("data-audio", "muted");
    } else {
      btn.removeAttribute("data-audio");
    }
  }

  updateBadge(panel) {
    const btn = this._icons.get(panel.id);
    if (!btn) return;
    if (panel._badge > 0) {
      btn.setAttribute("data-badge", String(panel._badge));
    } else {
      btn.removeAttribute("data-badge");
    }
  }

  // ── Drag & Drop Reordering ────────────────────────────────────────

  _setupDrag(btn, panel) {
    let startY = 0;
    let dragging = false;
    let placeholder = null;

    const onMouseDown = (e) => {
      if (e.button !== 0) return; // left click only
      startY = e.clientY;
      dragging = false;

      const onMouseMove = (e2) => {
        const dy = Math.abs(e2.clientY - startY);
        if (!dragging && dy > 5) {
          // Start drag
          dragging = true;
          btn.setAttribute("data-dragging", "true");

          // Create placeholder
          placeholder = this.doc.createXULElement("vbox");
          placeholder.setAttribute("class", "zen-sidebar-drag-placeholder");
          placeholder.style.height = `${btn.getBoundingClientRect().height}px`;
          btn.parentNode.insertBefore(placeholder, btn);
        }

        if (dragging) {
          // Position dragged icon via transform
          const btnRect = btn.getBoundingClientRect();
          const containerRect = this._iconContainer.getBoundingClientRect();
          const offsetY = e2.clientY - containerRect.top - btnRect.height / 2;
          btn.style.position = "relative";
          btn.style.zIndex = "9999";
          btn.style.transform = `translateY(${e2.clientY - startY}px)`;

          // Find which icon we're hovering over
          this._updateDropPosition(btn, e2.clientY, placeholder);
        }
      };

      const onMouseUp = () => {
        this.doc.removeEventListener("mousemove", onMouseMove);
        this.doc.removeEventListener("mouseup", onMouseUp);

        if (dragging) {
          btn.removeAttribute("data-dragging");
          btn.style.position = "";
          btn.style.zIndex = "";
          btn.style.transform = "";

          if (placeholder && placeholder.parentNode) {
            // Insert the btn where the placeholder is
            placeholder.parentNode.insertBefore(btn, placeholder);
            placeholder.remove();
          }

          // Read new order from DOM and sync to panel manager
          this._syncOrderFromDOM();
        }
      };

      this.doc.addEventListener("mousemove", onMouseMove);
      this.doc.addEventListener("mouseup", onMouseUp);
    };

    btn.addEventListener("mousedown", onMouseDown);
  }

  _updateDropPosition(draggedBtn, mouseY, placeholder) {
    const icons = [...this._icons.values()].filter((b) => b !== draggedBtn);

    for (const icon of icons) {
      const rect = icon.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (mouseY < midY) {
        // Insert placeholder before this icon
        if (placeholder.nextSibling !== icon) {
          this._iconContainer.insertBefore(placeholder, icon);
        }
        return;
      }
    }

    // Past all icons - insert before the + button
    if (placeholder.nextSibling !== this._addBtn) {
      this._iconContainer.insertBefore(placeholder, this._addBtn);
    }
  }

  _syncOrderFromDOM() {
    const newOrder = [];
    const children = this._iconContainer.children;
    for (const child of children) {
      const panelId = child.getAttribute("data-panel-id");
      if (!panelId) continue;
      const panel = this.sidebar.panelManager.panels.find((p) => p.id === panelId);
      if (panel) newOrder.push(panel);
    }
    if (newOrder.length === this.sidebar.panelManager.panels.length) {
      this.sidebar.panelManager.panels = newOrder;
      this.sidebar.panelManager.save();
    }
  }

  // ── Context Menu ──────────────────────────────────────────────────

  _showContextMenu(event, panel) {
    const existing = this.doc.getElementById("zen-sidebar-ctx-menu");
    if (existing) existing.remove();

    const popup = this._el("menupopup", { id: "zen-sidebar-ctx-menu" });

    const headerItem = this._el("menuitem", { label: panel.label, disabled: "true", class: "menuitem-iconic" });
    if (panel.icon) headerItem.setAttribute("image", panel.icon);

    const editItem = this._el("menuitem", { label: "Edit Panel..." });
    const iconBtn = this._icons.get(panel.id);
    editItem.addEventListener("command", () => this.sidebar.showAddPanelForm(panel, iconBtn));

    const containerName = this.sidebar.panelManager.getContainerName(panel.userContextId);
    const containerItem = this._el("menuitem", { label: `Container: ${containerName}` });
    containerItem.addEventListener("command", () => {
      const newId = this._promptContainerSelect(panel.userContextId || 0);
      if (newId !== null && newId !== panel.userContextId) {
        this.sidebar.panelManager.editPanel(panel, panel.url, panel.label, panel.icon, newId);
      }
    });

    const sep1 = this._el("menuseparator");

    const toolbarItem = this._el("menuitem", {
      label: panel.showToolbar !== false ? "Hide Navigation Bar" : "Show Navigation Bar",
    });
    toolbarItem.addEventListener("command", () => {
      panel.showToolbar = !panel.showToolbar;
      this.sidebar.panelManager.save();
      this.sidebar.updateNavBarVisibility();
    });

    const reloadItem = this._el("menuitem", { label: "Reload" });
    reloadItem.addEventListener("command", () => panel.reload());

    const homeItem = this._el("menuitem", { label: "Go to Home URL" });
    homeItem.addEventListener("command", () => {
      if (panel._browser) panel._browser.setAttribute("src", panel.url);
    });

    // Quick Actions
    const openTabItem = this._el("menuitem", { label: "Open in New Tab" });
    openTabItem.addEventListener("command", () => {
      const url = panel._browser?.currentURI?.spec || panel.url;
      try {
        this.sidebar.win.gBrowser.addTab(url, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
      } catch { this.sidebar.win.openUILinkIn(url, "tab"); }
    });

    const copyUrlItem = this._el("menuitem", { label: "Copy URL" });
    copyUrlItem.addEventListener("command", () => {
      const url = panel._browser?.currentURI?.spec || panel.url;
      try {
        const clip = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
        clip.copyString(url);
      } catch {
        // Fallback
        const ta = this.doc.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
        ta.value = url;
        this.doc.documentElement.appendChild(ta);
        ta.select();
        this.doc.execCommand("copy");
        ta.remove();
      }
    });

    // Mute/Unmute
    const muteItem = this._el("menuitem", {
      label: panel.muted ? "Unmute" : "Mute",
    });
    muteItem.addEventListener("command", () => panel.toggleMute());

    // Unload from memory
    const unloadItem = this._el("menuitem", {
      label: panel.isLoaded ? "Unload from Memory" : "Load into Memory",
    });
    unloadItem.addEventListener("command", () => {
      if (panel.isLoaded) {
        panel.unload();
        this.updateUnloadedState(panel);
        if (this.sidebar.panelManager.activePanel === panel) {
          this.sidebar.collapsePanel();
        }
      } else {
        panel.ensureBrowser();
        this.updateUnloadedState(panel);
      }
    });

    const sep2 = this._el("menuseparator");

    const removeItem = this._el("menuitem", { label: "Remove Panel" });
    removeItem.addEventListener("command", () => this.sidebar.panelManager.removePanel(panel));

    popup.append(
      headerItem, sep1,
      editItem, containerItem,
      sep2,
      toolbarItem, reloadItem, homeItem,
      openTabItem, copyUrlItem,
      muteItem, unloadItem,
      this._el("menuseparator"),
      removeItem
    );

    const popupSet = this.doc.getElementById("mainPopupSet") || this.doc.documentElement;
    popupSet.appendChild(popup);
    popup.openPopup(event.target, "after_end", 0, 0, true, false);
  }

  _promptContainerSelect(currentId = 0) {
    const containers = this.sidebar.panelManager.getContainers();
    if (containers.length === 0) return 0;
    const names = ["No Container", ...containers.map((c) => c.name)];
    const ids = [0, ...containers.map((c) => c.userContextId)];
    const selected = { value: Math.max(0, ids.indexOf(currentId)) };
    const ok = Services.prompt.select(
      this.sidebar.win, "Select Container",
      "Open this panel in a Firefox container:", names, selected
    );
    return ok ? ids[selected.value] : null;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  _tooltip(panel) {
    const mode = panel.tooltipMode || this.sidebar._tooltipDefault || "title";
    if (mode === "off") return "";
    const containerName = panel.userContextId > 0 ? ` [${this.sidebar.panelManager.getContainerName(panel.userContextId)}]` : "";
    const currentUrl = panel._browser?.currentURI?.spec || panel.url;
    switch (mode) {
      case "url": return currentUrl + containerName;
      case "both": return `${panel.label}\n${currentUrl}${containerName}`;
      default: return panel.label + containerName;
    }
  }

  _applyContainerColor(btn, panel) {
    if (panel.userContextId > 0) {
      const match = this.sidebar.panelManager.getContainers().find((c) => c.userContextId === panel.userContextId);
      if (match?.color) {
        btn.setAttribute("data-container-color", match.color);
        btn.style.setProperty("--container-color", CONTAINER_COLORS[match.color] || "transparent");
      }
    } else {
      btn.removeAttribute("data-container-color");
      btn.style.removeProperty("--container-color");
    }
  }

  _el(tag, attrs = {}) {
    const el = this.doc.createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
}

  // ═══════════════════════════════════════════════════════════════
  // SettingsDialog
  // ═══════════════════════════════════════════════════════════════

class SettingsDialog {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.doc = sidebar.doc;
    this._editPanel = null;
    this._settingsPanel = null;
  }

  // ── Panel Edit Dialog ─────────────────────────────────────────

  showEditPanel(panel, anchor) {
    this._closeAll();
    const isEdit = !!panel;
    const p = panel || {};

    const xul = (tag, attrs = {}) => {
      const el = this.doc.createXULElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const html = (tag, attrs = {}) => {
      const el = this.doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
      for (const [k, v] of Object.entries(attrs)) { el.setAttribute(k, v); }
      return el;
    };
    const label = (text) => {
      const l = xul("label", { value: text, class: "zen-settings-label" });
      return l;
    };
    const row = (...children) => {
      const r = xul("hbox", { class: "zen-settings-row", align: "center" });
      children.forEach((c) => r.appendChild(c));
      return r;
    };

    const popup = xul("panel", {
      id: "zen-settings-edit-panel",
      type: "arrow",
      class: "zen-settings-popup",
      role: "dialog",
      noautohide: "true",
    });

    const content = xul("vbox", { class: "zen-settings-content" });

    // Title
    const title = xul("label", {
      value: isEdit ? "Edit Panel" : "Add Panel",
      class: "zen-settings-title",
    });
    content.appendChild(title);

    // URL
    const urlInput = html("input", {
      type: "text", placeholder: "https://example.com",
      value: p.url || "https://", class: "zen-settings-input",
    });
    content.appendChild(label("URL"));
    content.appendChild(urlInput);

    // Width
    const widthInput = html("input", {
      type: "number", min: "200", max: "2000", step: "10",
      value: String(p.width || this.sidebar._getWidth()),
      class: "zen-settings-input zen-settings-input-short",
    });
    content.appendChild(row(label("Width"), widthInput));

    // Container
    const containers = this.sidebar.panelManager.getContainers();
    let containerSelect = null;
    if (containers.length > 0) {
      containerSelect = xul("menulist", { class: "zen-settings-menulist" });
      const cpopup = xul("menupopup");
      cpopup.appendChild(xul("menuitem", { value: "0", label: "No Container" }));
      for (const c of containers) {
        cpopup.appendChild(xul("menuitem", { value: String(c.userContextId), label: c.name }));
      }
      containerSelect.appendChild(cpopup);
      containerSelect.value = String(p.userContextId || 0);
      content.appendChild(row(label("Container"), containerSelect));
    }

    // Mobile UA
    const mobileCheck = xul("checkbox", { label: "Mobile User Agent", class: "zen-settings-check" });
    if (p.mobileUA !== false) mobileCheck.setAttribute("checked", "true");
    content.appendChild(mobileCheck);

    // Zoom
    const zoomInput = html("input", {
      type: "number", min: "0.3", max: "3.0", step: "0.1",
      value: String(p.zoom ?? 1.0),
      class: "zen-settings-input zen-settings-input-short",
    });
    content.appendChild(row(label("Zoom"), zoomInput));

    // Auto-reload interval
    const reloadSelect = xul("menulist", { class: "zen-settings-menulist" });
    const reloadPopup = xul("menupopup");
    const reloadOpts = [
      [0, "Off"], [30000, "30 seconds"], [60000, "1 minute"],
      [300000, "5 minutes"], [900000, "15 minutes"],
      [1800000, "30 minutes"], [3600000, "1 hour"],
    ];
    for (const [val, text] of reloadOpts) {
      reloadPopup.appendChild(xul("menuitem", { value: String(val), label: text }));
    }
    reloadSelect.appendChild(reloadPopup);
    reloadSelect.value = String(p.autoReloadInterval || 0);
    content.appendChild(row(label("Auto-Reload"), reloadSelect));

    // CSS Selector
    const cssInput = html("input", {
      type: "text", placeholder: "#main-content",
      value: p.cssSelector || "", class: "zen-settings-input",
    });
    content.appendChild(label("CSS Selector (extract)"));
    content.appendChild(cssInput);

    // Keybinding
    const keyInput = html("input", {
      type: "text", placeholder: "Click and press keys...",
      value: p.keybinding || "", class: "zen-settings-input",
      readonly: "true",
    });
    keyInput.addEventListener("focus", () => { keyInput.value = ""; });
    keyInput.addEventListener("keydown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      keyInput.value = parts.join("+");
    });
    const keyClearBtn = html("button", { class: "zen-settings-btn-small" });
    keyClearBtn.textContent = "Clear";
    keyClearBtn.addEventListener("click", () => { keyInput.value = ""; });
    content.appendChild(label("Keyboard Shortcut"));
    content.appendChild(row(keyInput, keyClearBtn));

    // Tooltip mode
    const tooltipSelect = xul("menulist", { class: "zen-settings-menulist" });
    const tooltipPopup = xul("menupopup");
    for (const opt of ["title", "url", "both", "off"]) {
      tooltipPopup.appendChild(xul("menuitem", { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) }));
    }
    tooltipSelect.appendChild(tooltipPopup);
    tooltipSelect.value = p.tooltipMode || "title";
    content.appendChild(row(label("Tooltip"), tooltipSelect));

    // Memory management
    const loadStartupCheck = xul("checkbox", { label: "Load on Startup", class: "zen-settings-check" });
    if (p.loadOnStartup !== false) loadStartupCheck.setAttribute("checked", "true");
    content.appendChild(loadStartupCheck);

    const unloadCloseCheck = xul("checkbox", { label: "Unload on Close", class: "zen-settings-check" });
    if (p.unloadOnClose) unloadCloseCheck.setAttribute("checked", "true");
    content.appendChild(unloadCloseCheck);

    // Unload timer
    const unloadTimerSelect = xul("menulist", { class: "zen-settings-menulist" });
    const unloadTimerPopup = xul("menupopup");
    const unloadTimerOpts = [
      [0, "Never"], [5, "5 minutes"], [10, "10 minutes"],
      [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"],
    ];
    for (const [val, text] of unloadTimerOpts) {
      unloadTimerPopup.appendChild(xul("menuitem", { value: String(val), label: text }));
    }
    unloadTimerSelect.appendChild(unloadTimerPopup);
    unloadTimerSelect.value = String(p.unloadTimer || 0);
    content.appendChild(row(label("Unload After Inactive"), unloadTimerSelect));

    // Title/Favicon overrides
    const customTitleInput = html("input", {
      type: "text", placeholder: "Auto (from page)",
      value: p.customTitle || "", class: "zen-settings-input",
    });
    content.appendChild(label("Custom Title"));
    content.appendChild(customTitleInput);

    const customIconInput = html("input", {
      type: "text", placeholder: "Auto (from page)",
      value: p.customIcon || "", class: "zen-settings-input",
    });
    content.appendChild(label("Custom Icon URL"));
    content.appendChild(customIconInput);

    // Buttons
    const btnRow = xul("hbox", { class: "zen-settings-btn-row", pack: "end" });
    const cancelBtn = html("button", { class: "zen-settings-btn" });
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => popup.hidePopup());
    const applyBtn = html("button", { class: "zen-settings-btn zen-settings-btn-primary" });
    applyBtn.textContent = isEdit ? "Apply" : "Add";
    applyBtn.addEventListener("click", () => {
      let finalURL = urlInput.value.trim();
      if (!finalURL) return;
      if (!/^https?:\/\//i.test(finalURL)) finalURL = "https://" + finalURL;
      const width = Math.max(200, parseInt(widthInput.value, 10) || this.sidebar._getWidth());
      const userContextId = containerSelect ? parseInt(containerSelect.value, 10) : 0;

      const opts = {
        width,
        mobileUA: mobileCheck.checked,
        zoom: parseFloat(zoomInput.value) || 1.0,
        autoReloadInterval: parseInt(reloadSelect.value, 10) || 0,
        cssSelector: cssInput.value.trim(),
        keybinding: keyInput.value.trim(),
        tooltipMode: tooltipSelect.value,
        loadOnStartup: loadStartupCheck.checked,
        unloadOnClose: unloadCloseCheck.checked,
        unloadTimer: parseInt(unloadTimerSelect.value, 10) || 0,
        customTitle: customTitleInput.value.trim(),
        customIcon: customIconInput.value.trim(),
      };

      if (isEdit) {
        panel.width = opts.width;
        panel.mobileUA = opts.mobileUA;
        panel.zoom = opts.zoom;
        panel.autoReloadInterval = opts.autoReloadInterval;
        panel.cssSelector = opts.cssSelector;
        panel.keybinding = opts.keybinding;
        panel.tooltipMode = opts.tooltipMode;
        panel.loadOnStartup = opts.loadOnStartup;
        panel.unloadOnClose = opts.unloadOnClose;
        panel.unloadTimer = opts.unloadTimer;
        panel.customTitle = opts.customTitle;
        panel.customIcon = opts.customIcon;
        if (opts.customTitle) panel.label = opts.customTitle;
        if (opts.customIcon) panel.icon = opts.customIcon;
        this.sidebar.panelManager.editPanel(panel, finalURL, null, null, userContextId);
        // Restart unload timer if the setting changed
        this.sidebar.panelManager._stopUnloadTimer(panel);
        if (panel !== this.sidebar.panelManager.activePanel) {
          this.sidebar.panelManager._startUnloadTimer(panel);
        }
      } else {
        this.sidebar.panelManager.addPanel(finalURL, opts.customTitle || null, opts.customIcon || null, userContextId, opts);
      }
      popup.hidePopup();
    });
    btnRow.append(cancelBtn, applyBtn);
    content.appendChild(btnRow);

    popup.appendChild(content);
    popup.addEventListener("popuphidden", (e) => { if (e.target !== popup) return; popup.remove(); this._editPanel = null; });

    const popupSet = this.doc.getElementById("mainPopupSet") || this.doc.documentElement;
    popupSet.appendChild(popup);
    this._editPanel = popup;
    popup.openPopup(anchor, "before_start", 0, 0, false, false);
  }

  // ── Global Settings Dialog ────────────────────────────────────

  showSettings(anchor) {
    this._closeAll();
    const s = this.sidebar;
    const xul = (tag, attrs = {}) => {
      const el = this.doc.createXULElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const html = (tag, attrs = {}) => {
      const el = this.doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const label = (text) => xul("label", { value: text, class: "zen-settings-label" });
    const row = (...children) => {
      const r = xul("hbox", { class: "zen-settings-row", align: "center" });
      children.forEach((c) => r.appendChild(c));
      return r;
    };

    const popup = xul("panel", {
      id: "zen-settings-global-panel",
      type: "arrow",
      class: "zen-settings-popup",
      role: "dialog",
      noautohide: "true",
    });
    const content = xul("vbox", { class: "zen-settings-content" });
    content.appendChild(xul("label", { value: "Sidebar Settings", class: "zen-settings-title" }));

    // Auto-hide
    const autoHideCheck = xul("checkbox", { label: "Auto-Hide Sidebar", class: "zen-settings-check" });
    if (s._autoHide) autoHideCheck.setAttribute("checked", "true");
    content.appendChild(autoHideCheck);

    const autoHideDelayInput = html("input", {
      type: "number", min: "100", max: "5000", step: "100",
      value: String(s._autoHideDelay), class: "zen-settings-input zen-settings-input-short",
    });
    content.appendChild(row(label("Hide Delay (ms)"), autoHideDelayInput));

    const autoHideModeSelect = xul("menulist", { class: "zen-settings-menulist" });
    const hmPopup = xul("menupopup");
    for (const m of ["slide", "overlay"]) {
      hmPopup.appendChild(xul("menuitem", { value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }));
    }
    autoHideModeSelect.appendChild(hmPopup);
    autoHideModeSelect.value = s._autoHideMode;
    content.appendChild(row(label("Hide Mode"), autoHideModeSelect));

    // Padding
    // Sidebar size
    const sizeSelect = xul("menulist", { class: "zen-settings-menulist" });
    const sizePopup = xul("menupopup");
    for (const [val, lbl] of [["smallest","Smallest"],["small","Small"],["medium","Medium"],["large","Large"],["largest","Largest"]]) {
      sizePopup.appendChild(xul("menuitem", { value: val, label: lbl }));
    }
    sizeSelect.appendChild(sizePopup);
    sizeSelect.value = s._sidebarSize;
    content.appendChild(row(label("Sidebar Size"), sizeSelect));

    // Container indicator style
    const indicatorSelect = xul("menulist", { class: "zen-settings-menulist" });
    const ciPopup = xul("menupopup");
    for (const [val, lbl] of [
      ["dot", "Dot"], ["outline", "Outline"], ["outline-left", "Outline Left"],
      ["outline-top", "Outline Top"], ["outline-bottom", "Outline Bottom"],
      ["outline-right", "Outline Right"], ["none", "None"],
    ]) {
      ciPopup.appendChild(xul("menuitem", { value: val, label: lbl }));
    }
    indicatorSelect.appendChild(ciPopup);
    indicatorSelect.value = s._containerIndicatorPosition;
    content.appendChild(row(label("Container Indicator"), indicatorSelect));

    // Animations
    const animCheck = xul("checkbox", { label: "Animations", class: "zen-settings-check" });
    if (s._animations) animCheck.setAttribute("checked", "true");
    content.appendChild(animCheck);

    // Auto-hide nav buttons
    const navBtnCheck = xul("checkbox", { label: "Auto-hide Nav Buttons", class: "zen-settings-check" });
    if (s._autoHideNavButtons) navBtnCheck.setAttribute("checked", "true");
    content.appendChild(navBtnCheck);

    // Default tooltip mode
    const tooltipSelect = xul("menulist", { class: "zen-settings-menulist" });
    const ttPopup = xul("menupopup");
    for (const opt of ["title", "url", "both", "off"]) {
      ttPopup.appendChild(xul("menuitem", { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) }));
    }
    tooltipSelect.appendChild(ttPopup);
    tooltipSelect.value = s._tooltipDefault;
    content.appendChild(row(label("Default Tooltip"), tooltipSelect));

    // Color helpers
    const rgbaToHex = (rgba) => {
      const m = rgba.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
      if (!m) return { hex: "#000000", opacity: 10 };
      const hex = "#" + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,"0")).join("");
      return { hex, opacity: Math.round((parseFloat(m[4] ?? 1) * 100)) };
    };
    const hexToRgba = (hex, opacity) => {
      const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
      return `rgba(${r},${g},${b},${opacity / 100})`;
    };

    // Toolbar color
    const tbParsed = rgbaToHex(s._toolbarColor);
    const tbColorInput = html("input", { type: "color", value: tbParsed.hex, class: "zen-settings-color" });
    const tbOpacityInput = html("input", { type: "range", min: "0", max: "100", value: String(tbParsed.opacity), class: "zen-settings-range" });
    const tbOpacityLabel = xul("label", { value: tbParsed.opacity + "%", class: "zen-settings-label" });
    tbOpacityInput.addEventListener("input", () => { tbOpacityLabel.setAttribute("value", tbOpacityInput.value + "%"); });
    content.appendChild(label("Toolbar Color"));
    content.appendChild(row(tbColorInput, tbOpacityInput, tbOpacityLabel));

    // Nav bar color
    const nbParsed = rgbaToHex(s._navbarColor);
    const nbColorInput = html("input", { type: "color", value: nbParsed.hex, class: "zen-settings-color" });
    const nbOpacityInput = html("input", { type: "range", min: "0", max: "100", value: String(nbParsed.opacity), class: "zen-settings-range" });
    const nbOpacityLabel = xul("label", { value: nbParsed.opacity + "%", class: "zen-settings-label" });
    nbOpacityInput.addEventListener("input", () => { nbOpacityLabel.setAttribute("value", nbOpacityInput.value + "%"); });
    content.appendChild(label("Nav Bar Color"));
    content.appendChild(row(nbColorInput, nbOpacityInput, nbOpacityLabel));

    // Buttons
    const btnRow = xul("hbox", { class: "zen-settings-btn-row", pack: "end" });
    const cancelBtn = html("button", { class: "zen-settings-btn" });
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => popup.hidePopup());
    const applyBtn = html("button", { class: "zen-settings-btn zen-settings-btn-primary" });
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", () => {
      s._autoHide = autoHideCheck.checked;
      s._autoHideDelay = parseInt(autoHideDelayInput.value, 10) || 300;
      s._autoHideMode = autoHideModeSelect.value;
      s._sidebarSize = sizeSelect.value;
      s._containerIndicatorPosition = indicatorSelect.value;
      s._animations = animCheck.checked;
      s._autoHideNavButtons = navBtnCheck.checked;
      s._tooltipDefault = tooltipSelect.value;
      s._toolbarColor = hexToRgba(tbColorInput.value, parseInt(tbOpacityInput.value, 10));
      s._navbarColor = hexToRgba(nbColorInput.value, parseInt(nbOpacityInput.value, 10));
      s._savePrefs();
      s._applyVisualPrefs();
      popup.hidePopup();
    });
    btnRow.append(cancelBtn, applyBtn);
    content.appendChild(btnRow);

    popup.appendChild(content);
    popup.addEventListener("popuphidden", (e) => { if (e.target !== popup) return; popup.remove(); this._settingsPanel = null; });

    const popupSet = this.doc.getElementById("mainPopupSet") || this.doc.documentElement;
    popupSet.appendChild(popup);
    this._settingsPanel = popup;
    popup.openPopup(anchor, "before_start", 0, 0, false, false);
  }

  _closeAll() {
    if (this._editPanel) { try { this._editPanel.hidePopup(); } catch {} }
    if (this._settingsPanel) { try { this._settingsPanel.hidePopup(); } catch {} }
  }
}

  // ═══════════════════════════════════════════════════════════════
  // ZenSidebar
  // ═══════════════════════════════════════════════════════════════


const PREF_MODE = "zen.sidebar.mode";
const PREF_WIDTH = "zen.sidebar.width";
const PREF_AUTO_HIDE = "zen.sidebar.autoHide";
const PREF_AUTO_HIDE_DELAY = "zen.sidebar.autoHideDelay";
const PREF_AUTO_HIDE_MODE = "zen.sidebar.autoHideMode";
const PREF_PADDING = "zen.sidebar.padding";
const PREF_CONTAINER_INDICATOR = "zen.sidebar.containerIndicatorPosition";
const PREF_ANIMATIONS = "zen.sidebar.animations";
const PREF_AUTO_HIDE_NAV = "zen.sidebar.autoHideNavButtons";
const PREF_TOOLTIP_DEFAULT = "zen.sidebar.tooltipDefault";
const PREF_TOOLBAR_COLOR = "zen.sidebar.toolbarColor";
const PREF_NAVBAR_COLOR = "zen.sidebar.navbarColor";
const SIDEBAR_DEFAULT_WIDTH = 400;
const TOOLBAR_WIDTH = 48;
const ANIM_DURATION = 200; // ms – sidebar open/close transition time
const SIDEBAR_SIZES = {
  smallest: { toolbar: 36, icon: 26, img: 14, gap: 2, pad: 4, iconRadius: 7 },
  small:    { toolbar: 42, icon: 30, img: 16, gap: 3, pad: 6, iconRadius: 8 },
  medium:   { toolbar: 48, icon: 36, img: 20, gap: 4, pad: 8, iconRadius: 10 },
  large:    { toolbar: 56, icon: 42, img: 24, gap: 5, pad: 8, iconRadius: 12 },
  largest:  { toolbar: 64, icon: 48, img: 28, gap: 6, pad: 8, iconRadius: 14 },
};
const CONTAINER_COLORS = {
  blue: "#37adff", turquoise: "#00c79a", green: "#51cd00", yellow: "#ffcb00",
  orange: "#ff9f00", red: "#ff613d", pink: "#ff4bda", purple: "#af51f5",
};

class ZenSidebar {
  constructor(win) {
    this.win = win;
    this.doc = win.document;
    this.panelManager = new PanelManager(this);
    this.toolbar = new Toolbar(this);
    this.settingsDialog = new SettingsDialog(this);
    this._panelOpen = false;
    this._mode = "overlay";
    // Global settings
    this._autoHide = false;
    this._autoHideDelay = 300;
    this._autoHideMode = "slide";
    this._sidebarSize = "medium";
    this._containerIndicatorPosition = "dot";
    this._animations = true;
    this._autoHideNavButtons = false;
    this._tooltipDefault = "title";
    this._toolbarColor = "rgba(0,0,0,0.1)";
    this._navbarColor = "transparent";
    this._collapseTimer = null;
  }

  init() {
    console.log("[ZenSidebar] Initializing...");
    this._loadPrefs();
    this._buildDOM();
    this._injectInlineCSS();
    this._applyVisualPrefs();
    this._registerKeybinding();
    this._registerContentContextMenu();
    this._restorePanels();
    this._sidebarBox.removeAttribute("hidden");

    // Pre-warm layout engine when window regains focus (macOS App Nap
    // aggressively suspends rendering for background windows — the first
    // relayout after returning is expensive, especially in resize mode
    // which changes appcontent's margin). Touch both elements to wake up
    // their compositor layers before the user interacts.
    this._focusHandler = () => {
      if (this._sidebarBox) this._sidebarBox.offsetHeight;
      const appcontent = this.doc.getElementById("appcontent");
      if (appcontent) appcontent.offsetHeight;
    };
    this.win.addEventListener("focus", this._focusHandler);
    // Also listen for visibilitychange as a belt-and-suspenders approach
    this._visibilityHandler = () => {
      if (!this.doc.hidden) this._focusHandler();
    };
    this.doc.addEventListener("visibilitychange", this._visibilityHandler);

    console.log("[ZenSidebar] Ready.");
  }

  destroy() {
    if (this._focusHandler) this.win.removeEventListener("focus", this._focusHandler);
    if (this._visibilityHandler) this.doc.removeEventListener("visibilitychange", this._visibilityHandler);
    this._removeKeybinding();
    this._removeContentContextMenu();
    this._savePrefs();
    for (const el of [this._sidebarBox, this._inlineStyleEl]) {
      if (el) el.remove();
    }
  }

  // ── DOM Construction ──────────────────────────────────────────────

  _buildDOM() {
    const containerCandidates = ["browser", "tabbrowser-tabbox", "content-deck"];
    let container = null;
    for (const id of containerCandidates) {
      container = this.doc.getElementById(id);
      if (container) break;
    }
    if (!container) container = this.doc.documentElement;
    this._container = container;

    this._sidebarBox = this._el("vbox", { id: "zen-sidebar-box", hidden: "true" });

    // Drag handle - XUL vbox in the flex row, before panel area
    this._dragHandle = this._el("vbox", { id: "zen-sidebar-drag-handle" });
    this._dragHandle.style.display = "none";
    this._dragHandle.addEventListener("mousedown", (e) => {
      if (e.button === 0) this._onDragResize(e);
    });

    // Panel area (nav + content) - collapsible
    this._panelArea = this._el("vbox", { id: "zen-sidebar-panel-area", hidden: "true" });

    // Nav bar
    this._navBar = this._el("hbox", { id: "zen-sidebar-navbar", align: "center" });
    const backBtn = this._navBtn("zen-sb-back", "Back", "chrome://global/skin/icons/arrow-left.svg", () => this._navAction("back"));
    const fwdBtn = this._navBtn("zen-sb-forward", "Forward", "chrome://global/skin/icons/arrow-right.svg", () => this._navAction("forward"));
    const reloadBtn = this._navBtn("zen-sb-reload", "Reload", "chrome://global/skin/icons/reload.svg", () => this._navAction("reload"));
    const homeBtn = this._navBtn("zen-sb-home", "Go to panel URL", "chrome://browser/skin/home.svg", () => this._navAction("home"));
    const zoomOutBtn = this._navBtn("zen-sb-zoom-out", "Zoom Out", "chrome://global/skin/icons/minus.svg", () => this._zoomAction("out"));
    const zoomResetBtn = this._navBtn("zen-sb-zoom-reset", "Reset Zoom", null, () => this._zoomAction("reset"));
    zoomResetBtn.setAttribute("label", "100%");
    zoomResetBtn.classList.add("zen-sb-zoom-label");
    const zoomInBtn = this._navBtn("zen-sb-zoom-in", "Zoom In", "chrome://global/skin/icons/plus.svg", () => this._zoomAction("in"));
    const spacer = this._el("spacer", { flex: "1" });
    const modeBtn = this._navBtn("zen-sb-mode", "Toggle overlay/resize", null, () => this.toggleMode());
    modeBtn.setAttribute("data-mode", this._mode);
    const closeBtn = this._navBtn("zen-sb-close", "Close panel", "chrome://global/skin/icons/close.svg", () => this.collapsePanel());
    closeBtn.classList.add("zen-sb-close-btn");
    this._zoomResetBtn = zoomResetBtn;
    this._navBar.append(backBtn, fwdBtn, reloadBtn, homeBtn, spacer, zoomOutBtn, zoomResetBtn, zoomInBtn, modeBtn, closeBtn);

    this._panelContainer = this._el("vbox", { id: "zen-sidebar-panel-container", flex: "1" });
    this._panelArea.append(this._navBar, this._panelContainer);

    const toolbarEl = this.toolbar.build();

    // Layout: [drag-handle | panel-area | icon-toolbar]
    this._sidebarBox.append(this._dragHandle, this._panelArea, toolbarEl);
    container.appendChild(this._sidebarBox);
    this._applyMode();
  }

  _navBtn(id, tooltip, iconUrl, handler) {
    const btn = this._el("toolbarbutton", { id, tooltiptext: tooltip, class: "zen-sb-nav-btn" });
    if (iconUrl) btn.setAttribute("image", iconUrl);
    btn.addEventListener("command", handler);
    return btn;
  }

  // ── Navigation Actions ────────────────────────────────────────────

  _navAction(action) {
    const panel = this.panelManager.activePanel;
    if (!panel || !panel._browser) return;
    switch (action) {
      case "back": panel._browser.goBack(); break;
      case "forward": panel._browser.goForward(); break;
      case "reload": panel._browser.reload(); break;
      case "home": panel._browser.setAttribute("src", panel.url); break;
    }
  }

  _zoomAction(action) {
    const panel = this.panelManager.activePanel;
    if (!panel) return;
    switch (action) {
      case "in": panel.zoomIn(); break;
      case "out": panel.zoomOut(); break;
      case "reset": panel.resetZoom(); break;
    }
    this._updateZoomLabel();
  }

  _updateZoomLabel() {
    const panel = this.panelManager.activePanel;
    if (this._zoomResetBtn) {
      const pct = Math.round((panel?.zoom || 1.0) * 100);
      this._zoomResetBtn.setAttribute("label", pct + "%");
    }
  }

  updateNavBarVisibility() {
    const panel = this.panelManager.activePanel;
    if (!panel) return;
    if (panel.showToolbar === false) {
      this._navBar.setAttribute("collapsed", "true");
    } else {
      this._navBar.removeAttribute("collapsed");
    }
    // Auto-hide back/forward when not applicable
    if (this._autoHideNavButtons && panel._browser) {
      const backBtn = this.doc.getElementById("zen-sb-back");
      const fwdBtn = this.doc.getElementById("zen-sb-forward");
      try {
        if (backBtn) backBtn.disabled = !panel._browser.canGoBack;
        if (fwdBtn) fwdBtn.disabled = !panel._browser.canGoForward;
      } catch {}
    }
  }

  // ── Panel Expand / Collapse ───────────────────────────────────────

  get panelOpen() { return this._panelOpen; }

  expandPanel(panel) {
    // Cancel any pending collapse cleanup
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    this._panelOpen = true;

    const panelWidth = panel?.width || this._getWidth();
    const toolbarWidth = this._getToolbarWidth();

    this._sidebarBox.removeAttribute("data-auto-hide-collapsed");
    this._panelArea.removeAttribute("hidden");
    this._panelArea.removeAttribute("data-collapsed");
    this._dragHandle.style.display = "";
    this._sidebarBox.setAttribute("data-panel-open", "true");
    this._applyMode();
    this.updateNavBarVisibility();
    this._updateZoomLabel();

    if (this._mode === "overlay") {
      this._panelArea.style.width = `${panelWidth}px`;
      this._sidebarBox.style.width = "";
    } else if (this._animations) {
      // Animated resize: suppress transitions, set start, reflow, animate to target
      this._sidebarBox.classList.add("zen-sidebar-no-transition");
      this._sidebarBox.style.width = `${toolbarWidth}px`;
      this._sidebarBox.getBoundingClientRect();
      this._sidebarBox.classList.remove("zen-sidebar-no-transition");
      this._sidebarBox.style.width = `${panelWidth + toolbarWidth}px`;
    } else {
      // No animation: just set final width directly
      this._sidebarBox.style.width = `${panelWidth + toolbarWidth}px`;
    }

    if (panel) panel.load();
  }

  collapsePanel() {
    // Cancel any pending collapse cleanup
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    this._panelOpen = false;
    this._sidebarBox.removeAttribute("data-panel-open");
    this._panelArea.style.width = "";

    if (this._mode === "overlay") {
      // Overlay: panel is fixed, just hide it
      this._panelArea.setAttribute("data-collapsed", "true");
      this._dragHandle.style.display = "none";
    } else if (this._animations) {
      this._sidebarBox.style.width = `${this._getToolbarWidth()}px`;
      this._clearResize();
      this._collapseTimer = setTimeout(() => { this._collapseTimer = null; this._finishCollapse(); }, ANIM_DURATION + 50);
    } else {
      this._panelArea.setAttribute("hidden", "true");
      this._dragHandle.style.display = "none";
      this._sidebarBox.style.width = "";
      this._clearResize();
      if (this._autoHide && this.toolbar._toolbar.hasAttribute("data-auto-hide-hidden")) {
        this._sidebarBox.setAttribute("data-auto-hide-collapsed", "true");
      }
    }

    this.toolbar.clearActive();
    // Unload panels that have unloadOnClose enabled
    for (const panel of this.panelManager.panels) {
      if (panel.unloadOnClose && panel.isLoaded) {
        panel.unload();
        this.toolbar.updateUnloadedState(panel);
      }
    }
  }

  _finishCollapse() {
    // Skip if panel was re-opened before cleanup fired
    if (this._panelOpen) return;
    this._panelArea.setAttribute("data-collapsed", "true");
    this._dragHandle.style.display = "none";
    this._sidebarBox.style.width = "";
    if (this._autoHide && this.toolbar._toolbar.hasAttribute("data-auto-hide-hidden")) {
      this._sidebarBox.setAttribute("data-auto-hide-collapsed", "true");
    }
  }

  switchToPanel(panel) {
    const active = this.panelManager.activePanel;
    if (active === panel && this._panelOpen) {
      this.collapsePanel();
      return;
    }
    this.panelManager.switchTo(panel);
    this.toolbar.updateUnloadedState(panel); // clear dimmed state after ensureBrowser
    this.expandPanel(panel);
  }

  // ── Add/Edit Panel ─────────────────────────────────────────────

  showAddPanelForm(editPanel = null, anchor = null) {
    const anchorEl = anchor || this.toolbar._addBtn || this._sidebarBox;
    this.settingsDialog.showEditPanel(editPanel, anchorEl);
  }

  // ── Mode Toggle ───────────────────────────────────────────────────

  get mode() { return this._mode; }

  toggleMode() {
    this._mode = this._mode === "overlay" ? "resize" : "overlay";
    this._applyMode();
    this._savePrefs();
  }

  _applyMode() {
    const box = this._sidebarBox;
    if (!box) return;
    box.setAttribute("data-mode", this._mode);
    const modeBtn = this.doc.getElementById("zen-sb-mode");
    if (modeBtn) {
      modeBtn.setAttribute("data-mode", this._mode);
      modeBtn.setAttribute("tooltiptext",
        this._mode === "overlay" ? "Switch to resize mode" : "Switch to overlay mode");
    }
    if (this._panelOpen) {
      this._mode === "resize" ? this._pushContent() : this._clearResize();
    }
  }

  _pushContent() {
    const appcontent = this.doc.getElementById("appcontent");
    const w = parseInt(this._sidebarBox.style.width, 10) || this._getWidth() + this._getToolbarWidth();
    if (appcontent) appcontent.style.marginRight = `${w}px`;
  }

  _clearResize() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) appcontent.style.marginRight = "";
  }

  _applyVisualPrefs() {
    if (!this._sidebarBox) return;
    // Sidebar size
    const sz = SIDEBAR_SIZES[this._sidebarSize] || SIDEBAR_SIZES.medium;
    this._sidebarBox.style.setProperty("--zen-toolbar-width", sz.toolbar + "px");
    this._sidebarBox.style.setProperty("--zen-icon-size", sz.icon + "px");
    this._sidebarBox.style.setProperty("--zen-icon-img", sz.img + "px");
    this._sidebarBox.style.setProperty("--zen-icon-gap", sz.gap + "px");
    this._sidebarBox.style.setProperty("--zen-toolbar-pad", sz.pad + "px");
    this._sidebarBox.style.setProperty("--zen-icon-radius", sz.iconRadius + "px");
    this._sidebarBox.setAttribute("data-indicator-pos", this._containerIndicatorPosition);
    // Colors
    this._sidebarBox.style.setProperty("--zen-toolbar-bg", this._toolbarColor);
    this._sidebarBox.style.setProperty("--zen-navbar-bg", this._navbarColor);
    if (!this._animations) {
      this._sidebarBox.setAttribute("data-no-animations", "true");
    } else {
      this._sidebarBox.removeAttribute("data-no-animations");
    }
    this._setupAutoHide();
  }

  // ── Auto-Hide ──────────────────────────────────────────────────
  // When enabled, the toolbar auto-hides after the mouse leaves.
  // If a panel is open, the panel stays visible — only the toolbar
  // strip slides away. If no panel is open, the entire sidebar box
  // collapses so page content fills the full width.
  // Hovering the right-edge trigger strip reveals the toolbar.
  // Settings dialogs prevent auto-hide while open.

  _autoHideToolbar() {
    this.toolbar._toolbar.setAttribute("data-auto-hide-hidden", "true");
    // If no panel is open, collapse the sidebar box entirely
    if (!this._panelOpen) {
      this._sidebarBox.setAttribute("data-auto-hide-collapsed", "true");
    }
  }

  _autoShowToolbar() {
    this._sidebarBox.removeAttribute("data-auto-hide-collapsed");
    this.toolbar._toolbar.removeAttribute("data-auto-hide-hidden");
  }

  _setupAutoHide() {
    // Clean up previous
    if (this._autoHideEnterHandler) {
      this._sidebarBox.removeEventListener("mouseenter", this._autoHideEnterHandler);
      this._sidebarBox.removeEventListener("mouseleave", this._autoHideLeaveHandler);
      this._autoHideEnterHandler = null;
      this._autoHideLeaveHandler = null;
    }
    if (this._autoHideTrigger) {
      this._autoHideTrigger.remove();
      this._autoHideTrigger = null;
    }
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }

    if (!this._autoHide) {
      this._sidebarBox.removeAttribute("data-auto-hide");
      this._sidebarBox.removeAttribute("data-auto-hide-collapsed");
      this.toolbar._toolbar.removeAttribute("data-auto-hide-hidden");
      this._sidebarBox.style.display = "";
      return;
    }

    // Create a thin trigger strip fixed to the right edge
    if (!this.doc.getElementById("zen-sidebar-autohide-trigger")) {
      this._autoHideTrigger = this.doc.createXULElement("vbox");
      this._autoHideTrigger.id = "zen-sidebar-autohide-trigger";
      this._container.appendChild(this._autoHideTrigger);
    } else {
      this._autoHideTrigger = this.doc.getElementById("zen-sidebar-autohide-trigger");
    }

    this._sidebarBox.setAttribute("data-auto-hide", "true");
    this._sidebarBox.style.display = "";
    // Start hidden
    this._autoHideToolbar();

    // Trigger strip: hover to reveal toolbar
    this._autoHideTrigger.addEventListener("mouseenter", () => {
      this._autoShowToolbar();
    });

    // Sidebar: mouse leave to hide toolbar after delay
    this._autoHideLeaveHandler = () => {
      // Don't auto-hide while a settings dialog is open
      if (this.settingsDialog._editPanel || this.settingsDialog._settingsPanel) return;
      if (this._autoHideTimer) clearTimeout(this._autoHideTimer);
      this._autoHideTimer = setTimeout(() => {
        this._autoHideTimer = null;
        if (this.settingsDialog._editPanel || this.settingsDialog._settingsPanel) return;
        this._autoHideToolbar();
      }, this._autoHideDelay);
    };

    this._autoHideEnterHandler = () => {
      // Only cancel the hide timer — don't reveal toolbar (trigger strip does that)
      if (this._autoHideTimer) {
        clearTimeout(this._autoHideTimer);
        this._autoHideTimer = null;
      }
    };

    this._sidebarBox.addEventListener("mouseenter", this._autoHideEnterHandler);
    this._sidebarBox.addEventListener("mouseleave", this._autoHideLeaveHandler);
  }

  // ── Drag Handle Resize (saves per-panel width) ─────────────────────

  _onDragResize(startEvent) {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidth = this._sidebarBox.getBoundingClientRect().width;

    // Disable pointer events on panel content to prevent browser element stealing mouse
    this._panelArea.style.pointerEvents = "none";
    this._sidebarBox.style.userSelect = "none";
    // Suppress transitions during drag to prevent jitter
    this._sidebarBox.classList.add("zen-sidebar-dragging");
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) appcontent.style.transition = "none";

    let pendingFrame = null;

    const onMouseMove = (e) => {
      e.preventDefault();
      if (pendingFrame) return; // throttle to animation frames
      pendingFrame = this.win.requestAnimationFrame(() => {
        pendingFrame = null;
        const delta = startX - e.clientX;
        const totalW = Math.max(200 + this._getToolbarWidth(), startWidth + delta);
        this._sidebarBox.style.width = `${totalW}px`;
        if (this._mode === "resize") this._pushContent();
      });
    };
    const onMouseUp = () => {
      this.doc.removeEventListener("mousemove", onMouseMove);
      this.doc.removeEventListener("mouseup", onMouseUp);
      if (pendingFrame) this.win.cancelAnimationFrame(pendingFrame);
      // Restore pointer events and transitions
      this._panelArea.style.pointerEvents = "";
      this._sidebarBox.style.userSelect = "";
      this._sidebarBox.classList.remove("zen-sidebar-dragging");
      if (appcontent) appcontent.style.transition = "";
      // Save to active panel
      const totalW = parseInt(this._sidebarBox.style.width, 10) || 0;
      const panelW = totalW - this._getToolbarWidth();
      const active = this.panelManager.activePanel;
      if (active && panelW > 0) {
        active.width = panelW;
        this.panelManager.save();
      }
    };
    this.doc.addEventListener("mousemove", onMouseMove);
    this.doc.addEventListener("mouseup", onMouseUp);
  }

  // ── Keyboard Shortcut ─────────────────────────────────────────────

  _registerKeybinding() {
    this._keyHandler = (e) => {
      // Global toggle: Ctrl+Shift+E
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (this._panelOpen) {
          this.collapsePanel();
        } else {
          const active = this.panelManager.activePanel;
          if (active) this.switchToPanel(active);
        }
        return;
      }
      // Per-panel shortcuts
      for (const panel of this.panelManager.panels) {
        if (!panel.keybinding) continue;
        if (this._matchKeybinding(e, panel.keybinding)) {
          e.preventDefault();
          this.switchToPanel(panel);
          return;
        }
      }
    };
    this.win.addEventListener("keydown", this._keyHandler);
  }

  _matchKeybinding(event, binding) {
    const parts = binding.toLowerCase().split("+");
    const key = parts.pop();
    const needCtrl = parts.includes("ctrl");
    const needShift = parts.includes("shift");
    const needAlt = parts.includes("alt");
    if (needCtrl !== (event.ctrlKey || event.metaKey)) return false;
    if (needShift !== event.shiftKey) return false;
    if (needAlt !== event.altKey) return false;
    const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    return eventKey === key;
  }

  _removeKeybinding() {
    if (this._keyHandler) this.win.removeEventListener("keydown", this._keyHandler);
  }

  // ── Content Context Menu (right-click on web pages) ───────────────

  _registerContentContextMenu() {
    const menu = this.doc.getElementById("contentAreaContextMenu");
    if (!menu) return;

    this._ctxSep = this.doc.createXULElement("menuseparator");
    this._ctxSep.id = "zen-sidebar-ctx-sep";

    this._ctxOpenLink = this.doc.createXULElement("menuitem");
    this._ctxOpenLink.id = "zen-sidebar-ctx-open-link";
    this._ctxOpenLink.setAttribute("label", "Open Link in Sidebar");
    this._ctxOpenLink.setAttribute("hidden", "true");
    this._ctxOpenLink.addEventListener("command", () => {
      const url = this.win.gContextMenu?.linkURL;
      if (url) this.panelManager.addPanel(url);
    });

    this._ctxSearch = this.doc.createXULElement("menuitem");
    this._ctxSearch.id = "zen-sidebar-ctx-search";
    this._ctxSearch.setAttribute("label", "Search in Sidebar");
    this._ctxSearch.setAttribute("hidden", "true");
    this._ctxSearch.addEventListener("command", () => {
      const text = this.win.gContextMenu?.selectionInfo?.text;
      if (text) {
        const url = `https://www.google.com/search?q=${encodeURIComponent(text.trim().slice(0, 200))}`;
        this.panelManager.addPanel(url);
      }
    });

    menu.appendChild(this._ctxSep);
    menu.appendChild(this._ctxOpenLink);
    menu.appendChild(this._ctxSearch);

    this._ctxPopupHandler = () => {
      const ctx = this.win.gContextMenu;
      const hasLink = !!(ctx && ctx.linkURL);
      const hasSelection = !!(ctx && ctx.selectionInfo && ctx.selectionInfo.text);
      this._ctxOpenLink.hidden = !hasLink;
      this._ctxSearch.hidden = !hasSelection;
      this._ctxSep.hidden = !hasLink && !hasSelection;
      if (hasSelection) {
        const preview = ctx.selectionInfo.text.trim().slice(0, 30);
        this._ctxSearch.setAttribute("label", `Search "${preview}${ctx.selectionInfo.text.length > 30 ? "..." : ""}" in Sidebar`);
      }
    };
    menu.addEventListener("popupshowing", this._ctxPopupHandler);

    // Tab context menu — "Move to Sidebar"
    const tabMenu = this.doc.getElementById("tabContextMenu");
    if (tabMenu) {
      this._tabCtxSep = this.doc.createXULElement("menuseparator");
      this._tabCtxSep.id = "zen-sidebar-tab-ctx-sep";

      this._tabCtxMove = this.doc.createXULElement("menuitem");
      this._tabCtxMove.id = "zen-sidebar-tab-ctx-move";
      this._tabCtxMove.setAttribute("label", "Move to Sidebar");
      this._tabCtxMove.addEventListener("command", () => {
        const tab = this.win.TabContextMenu?.contextTab || this.win.gBrowser?.selectedTab;
        if (tab) {
          const url = tab.linkedBrowser?.currentURI?.spec || "";
          const userContextId = tab.userContextId || tab.getAttribute("usercontextid") || 0;
          if (url && url !== "about:blank") {
            this.panelManager.addPanel(url, null, null, parseInt(userContextId, 10) || 0);
          }
        }
      });

      tabMenu.appendChild(this._tabCtxSep);
      tabMenu.appendChild(this._tabCtxMove);
    }
  }

  _removeContentContextMenu() {
    if (this._ctxSep) this._ctxSep.remove();
    if (this._ctxOpenLink) this._ctxOpenLink.remove();
    if (this._ctxSearch) this._ctxSearch.remove();
    if (this._tabCtxSep) this._tabCtxSep.remove();
    if (this._tabCtxMove) this._tabCtxMove.remove();
    const menu = this.doc.getElementById("contentAreaContextMenu");
    if (menu && this._ctxPopupHandler) {
      menu.removeEventListener("popupshowing", this._ctxPopupHandler);
    }
  }

  // ── Preferences ───────────────────────────────────────────────────

  _loadPrefs() {
    try { this._mode = Services.prefs.getStringPref(PREF_MODE, "overlay") || "overlay"; } catch { this._mode = "overlay"; }
    try { this._autoHide = Services.prefs.getBoolPref(PREF_AUTO_HIDE, false); } catch { this._autoHide = false; }
    try { this._autoHideDelay = Services.prefs.getIntPref(PREF_AUTO_HIDE_DELAY, 300); } catch { this._autoHideDelay = 300; }
    try { this._autoHideMode = Services.prefs.getStringPref(PREF_AUTO_HIDE_MODE, "slide") || "slide"; } catch { this._autoHideMode = "slide"; }
    try {
      const rawPad = Services.prefs.getStringPref(PREF_PADDING, "medium");
      this._sidebarSize = SIDEBAR_SIZES[rawPad] ? rawPad : "medium";
    } catch { this._sidebarSize = "medium"; }
    try { this._containerIndicatorPosition = Services.prefs.getStringPref(PREF_CONTAINER_INDICATOR, "dot") || "dot"; } catch { this._containerIndicatorPosition = "dot"; }
    try { this._animations = Services.prefs.getBoolPref(PREF_ANIMATIONS, true); } catch { this._animations = true; }
    try { this._autoHideNavButtons = Services.prefs.getBoolPref(PREF_AUTO_HIDE_NAV, false); } catch { this._autoHideNavButtons = false; }
    try { this._tooltipDefault = Services.prefs.getStringPref(PREF_TOOLTIP_DEFAULT, "title") || "title"; } catch { this._tooltipDefault = "title"; }
    try { this._toolbarColor = Services.prefs.getStringPref(PREF_TOOLBAR_COLOR, "rgba(0,0,0,0.1)"); } catch { this._toolbarColor = "rgba(0,0,0,0.1)"; }
    try { this._navbarColor = Services.prefs.getStringPref(PREF_NAVBAR_COLOR, "transparent"); } catch { this._navbarColor = "transparent"; }
  }

  _savePrefs() {
    Services.prefs.setStringPref(PREF_MODE, this._mode);
    Services.prefs.setBoolPref(PREF_AUTO_HIDE, this._autoHide);
    Services.prefs.setIntPref(PREF_AUTO_HIDE_DELAY, this._autoHideDelay);
    Services.prefs.setStringPref(PREF_AUTO_HIDE_MODE, this._autoHideMode);
    Services.prefs.setStringPref(PREF_PADDING, this._sidebarSize);
    Services.prefs.setStringPref(PREF_CONTAINER_INDICATOR, this._containerIndicatorPosition);
    Services.prefs.setBoolPref(PREF_ANIMATIONS, this._animations);
    Services.prefs.setBoolPref(PREF_AUTO_HIDE_NAV, this._autoHideNavButtons);
    Services.prefs.setStringPref(PREF_TOOLTIP_DEFAULT, this._tooltipDefault);
    Services.prefs.setStringPref(PREF_TOOLBAR_COLOR, this._toolbarColor);
    Services.prefs.setStringPref(PREF_NAVBAR_COLOR, this._navbarColor);
    this.panelManager.save();
  }

  _getWidth() {
    try { return Services.prefs.getIntPref(PREF_WIDTH, SIDEBAR_DEFAULT_WIDTH); }
    catch { return SIDEBAR_DEFAULT_WIDTH; }
  }

  _getToolbarWidth() {
    return (SIDEBAR_SIZES[this._sidebarSize] || SIDEBAR_SIZES.medium).toolbar;
  }

  _restorePanels() { this.panelManager.restore(); }

  // ── Utility ───────────────────────────────────────────────────────

  _el(tag, attrs = {}) {
    const el = this.doc.createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  _injectInlineCSS() {
    const style = this.doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.textContent = CSS_TEXT;
    this.doc.documentElement.appendChild(style);
    this._inlineStyleEl = style;
  }
}

const CSS_TEXT = `
/* ── Sidebar Outer Box ─────────────────────────────────────── */
#zen-sidebar-box {
  display: flex; flex-direction: row;
  background: transparent;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: visible;
  position: relative;
  min-width: var(--zen-toolbar-width, ${TOOLBAR_WIDTH}px);
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: width;
  contain: layout style;
}
#zen-sidebar-box[hidden="true"] { display: none !important; }
#zen-sidebar-box[data-panel-open][data-mode="overlay"] {
  position: relative;
}
#zen-sidebar-box[data-panel-open][data-mode="resize"] {
  position: relative; z-index: 1;
}

/* Overlay mode: panel floats to the left of the toolbar */
#zen-sidebar-box[data-mode="overlay"] #zen-sidebar-panel-area {
  position: fixed; top: 8px; bottom: 8px; z-index: 10000;
  right: calc(var(--zen-toolbar-width, ${TOOLBAR_WIDTH}px) + 8px);
  box-shadow: -2px 0 12px rgba(0,0,0,0.25);
  margin: 0; border-radius: 10px;
}
/* Hide drag handle in overlay since panel is fixed-positioned */
#zen-sidebar-box[data-mode="overlay"] #zen-sidebar-drag-handle { display: none !important; }
/* Disable transitions during drag resize */
#zen-sidebar-box.zen-sidebar-dragging,
#zen-sidebar-box.zen-sidebar-dragging * { transition: none !important; }
#zen-sidebar-box.zen-sidebar-no-transition,
#zen-sidebar-box.zen-sidebar-no-transition * { transition: none !important; }

/* ── Drag Handle (flex child, left of panel area) ──────────── */
#zen-sidebar-drag-handle {
  width: 5px; min-width: 5px; max-width: 5px;
  cursor: ew-resize;
  background: transparent;
  flex-shrink: 0;
}
#zen-sidebar-drag-handle:hover {
  background: var(--zen-primary-color, color-mix(in srgb, AccentColor 80%, transparent));
}

/* ── Panel Area (collapsible, rounded with spacing) ────────── */
#zen-sidebar-panel-area {
  display: flex; flex-direction: column;
  flex: 1; min-width: 0;
  overflow: hidden;
  border-radius: 10px;
  margin: var(--zen-sidebar-padding, 8px) var(--zen-sidebar-padding, 8px) var(--zen-sidebar-padding, 8px) 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  transition: opacity 0.15s ease;
}
#zen-sidebar-panel-area[hidden="true"] { display: none !important; }
#zen-sidebar-panel-area[data-collapsed="true"] {
  width: 0 !important; min-width: 0 !important;
  overflow: hidden !important;
  opacity: 0; pointer-events: none;
  margin: 0; border: none; padding: 0;
}

/* ── Nav Bar ───────────────────────────────────────────────── */
#zen-sidebar-navbar {
  display: flex; align-items: center; gap: 2px;
  padding: 4px 6px;
  min-height: 34px; flex-shrink: 0;
  background: var(--zen-navbar-bg, transparent);
  border-bottom: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
}
#zen-sidebar-navbar[collapsed="true"] { display: none !important; }

.zen-sb-nav-btn {
  appearance: none; width: 28px; height: 28px; min-width: 28px; min-height: 28px;
  border-radius: 6px; background: transparent; border: none;
  cursor: pointer;
  padding: 0; opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
  -moz-box-pack: center; -moz-box-align: center;
}
.zen-sb-nav-btn .toolbarbutton-text { display: none; }
.zen-sb-nav-btn .toolbarbutton-icon {
  width: 14px; height: 14px;
  -moz-context-properties: fill; fill: var(--toolbar-color, #fbfbfe);
}
.zen-sb-nav-btn:hover {
  background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08)); opacity: 1;
}
/* Zoom label button */
.zen-sb-zoom-label { font-size: 10px; min-width: 36px !important; width: auto !important; }
.zen-sb-zoom-label .toolbarbutton-icon { display: none; }
.zen-sb-zoom-label .toolbarbutton-text {
  display: inline; color: var(--toolbar-color, #fbfbfe); font-size: 10px; opacity: 0.7;
}
/* Space before close button */
.zen-sb-close-btn { margin-inline-start: 6px; }
.zen-sb-close-btn:hover { background: rgba(255,70,70,0.25) !important; opacity: 1; }
#zen-sb-mode .toolbarbutton-icon { display: none; }
#zen-sb-mode::after {
  content: ""; display: block; width: 14px; height: 14px; margin: auto;
  background: var(--toolbar-color, #fbfbfe);
  mask-size: contain; mask-repeat: no-repeat; mask-position: center; opacity: 0.7;
}
#zen-sb-mode[data-mode="overlay"]::after { mask-image: url("chrome://global/skin/icons/open-in-new.svg"); }
#zen-sb-mode[data-mode="resize"]::after { mask-image: url("chrome://global/skin/icons/arrow-left.svg"); }

/* ── Panel Container ──────────────────────────────────────── */
#zen-sidebar-panel-container {
  display: flex; flex-direction: column; flex: 1;
  overflow: hidden;
}
.zen-sidebar-web-panel-browser {
  flex: 1; border: none;
}

/* ── Icon Toolbar (always visible, fixed width) ───────────── */
#zen-sidebar-toolbar {
  display: flex; flex-direction: column;
  width: var(--zen-toolbar-width, ${TOOLBAR_WIDTH}px);
  min-width: var(--zen-toolbar-width, ${TOOLBAR_WIDTH}px);
  max-width: var(--zen-toolbar-width, ${TOOLBAR_WIDTH}px);
  flex-shrink: 0;
  background: var(--zen-toolbar-bg, rgba(0,0,0,0.1));
  padding: var(--zen-toolbar-pad, 8px) 0;
  box-sizing: border-box;
  border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
}
#zen-sidebar-toolbar-icons {
  display: flex; flex-direction: column;
  align-items: center; gap: var(--zen-icon-gap, 4px);
  overflow-y: auto; overflow-x: hidden;
  padding: 0; flex: 1;
}

/* ── Panel Icons ───────────────────────────────────────────── */
.zen-sidebar-panel-icon {
  appearance: none;
  width: var(--zen-icon-size, 36px); height: var(--zen-icon-size, 36px);
  min-width: var(--zen-icon-size, 36px); min-height: var(--zen-icon-size, 36px);
  border-radius: var(--zen-icon-radius, 10px); background: transparent;
  border: 2px solid transparent;
  cursor: default;
  padding: 0;
  position: relative;
  transition: background 0.12s, border-color 0.12s;
  box-sizing: border-box;
  -moz-box-pack: center; -moz-box-align: center;
}
.zen-sidebar-panel-icon .toolbarbutton-icon {
  width: var(--zen-icon-img, 20px); height: var(--zen-icon-img, 20px);
}
.zen-sidebar-panel-icon .toolbarbutton-text { display: none; }
.zen-sidebar-panel-icon:hover {
  background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08));
}
.zen-sidebar-panel-icon[data-active="true"] {
  background: var(--toolbarbutton-active-background, rgba(255,255,255,0.12));
  border-color: var(--zen-primary-color, AccentColor);
}

/* Container indicator — dot (default) */
.zen-sidebar-panel-icon[data-container-color]::after {
  content: ""; position: absolute; bottom: 0; right: 0;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--container-color);
  border: 1.5px solid var(--toolbar-bgcolor, #1c1b22);
}
/* Container indicator — outline (full border) */
[data-indicator-pos="outline"] .zen-sidebar-panel-icon[data-container-color] { border-color: var(--container-color); }
[data-indicator-pos="outline"] .zen-sidebar-panel-icon[data-container-color]::after { display: none; }
/* Container indicator — outline sides */
[data-indicator-pos="outline-left"] .zen-sidebar-panel-icon[data-container-color] { border-left-color: var(--container-color); }
[data-indicator-pos="outline-left"] .zen-sidebar-panel-icon[data-container-color]::after { display: none; }
[data-indicator-pos="outline-top"] .zen-sidebar-panel-icon[data-container-color] { border-top-color: var(--container-color); }
[data-indicator-pos="outline-top"] .zen-sidebar-panel-icon[data-container-color]::after { display: none; }
[data-indicator-pos="outline-bottom"] .zen-sidebar-panel-icon[data-container-color] { border-bottom-color: var(--container-color); }
[data-indicator-pos="outline-bottom"] .zen-sidebar-panel-icon[data-container-color]::after { display: none; }
[data-indicator-pos="outline-right"] .zen-sidebar-panel-icon[data-container-color] { border-right-color: var(--container-color); }
[data-indicator-pos="outline-right"] .zen-sidebar-panel-icon[data-container-color]::after { display: none; }
/* Container indicator — none */
[data-indicator-pos="none"] .zen-sidebar-panel-icon[data-container-color]::after { display: none; }

/* ── Add Button ────────────────────────────────────────────── */
#zen-sidebar-add-btn {
  appearance: none;
  width: var(--zen-icon-size, 36px); height: var(--zen-icon-size, 36px);
  min-width: var(--zen-icon-size, 36px); min-height: var(--zen-icon-size, 36px);
  border-radius: var(--zen-icon-radius, 10px); background: transparent;
  border: 1.5px dashed rgba(128,128,128,0.3);
  cursor: pointer; color: var(--toolbar-color, #fbfbfe);
  font-size: 18px; font-weight: 300;
  opacity: 0.5; transition: opacity 0.15s, border-color 0.15s;
  box-sizing: border-box;
  -moz-box-pack: center; -moz-box-align: center;
}
#zen-sidebar-add-btn .toolbarbutton-text { margin: 0; padding: 0; }
#zen-sidebar-add-btn:hover {
  opacity: 1; border-color: var(--zen-primary-color, AccentColor);
}

/* ── Drag & Drop ───────────────────────────────────────────── */
.zen-sidebar-panel-icon[data-dragging="true"] {
  opacity: 0.7; cursor: grabbing !important;
}
/* Unloaded panel icon */
.zen-sidebar-panel-icon[data-unloaded="true"] {
  opacity: 0.35;
}

/* ── Audio indicator ──────────────────────────────────────── */
.zen-sidebar-panel-icon[data-audio="playing"]::before {
  content: ""; position: absolute; top: 0px; left: 0px;
  width: 10px; height: 10px;
  background: url("chrome://browser/skin/notification-icons/audio.svg") center/8px no-repeat;
  -moz-context-properties: fill; fill: #fff;
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
}
.zen-sidebar-panel-icon[data-audio="muted"]::before {
  content: ""; position: absolute; top: 0px; left: 0px;
  width: 10px; height: 10px;
  background: url("chrome://browser/skin/notification-icons/audio-muted.svg") center/8px no-repeat;
  -moz-context-properties: fill; fill: #ff6b6b;
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
}

/* ── Notification badge ───────────────────────────────────── */
.zen-sidebar-panel-icon[data-badge]::after {
  content: attr(data-badge);
  position: absolute; top: -2px; right: -2px;
  min-width: 14px; height: 14px;
  background: #e03e3e; color: #fff;
  font-size: 9px; font-weight: 700;
  line-height: 14px; text-align: center;
  border-radius: 7px; padding: 0 3px;
  box-sizing: border-box;
  border: 1.5px solid var(--toolbar-bgcolor, #1c1b22);
}
/* Badge overrides the container color dot — hide dot when badge present */
.zen-sidebar-panel-icon[data-badge][data-container-color]::after {
  background: #e03e3e;
}

/* Disabled nav buttons */
.zen-sb-nav-btn[disabled="true"] { opacity: 0.25; pointer-events: none; }

/* ── Auto-Hide Trigger Strip ──────────────────────────────── */
#zen-sidebar-autohide-trigger {
  position: fixed; right: 0; top: 0; bottom: 0;
  width: 6px; z-index: 9999;
  background: transparent;
  cursor: pointer;
}
#zen-sidebar-autohide-trigger:hover {
  background: var(--zen-primary-color, color-mix(in srgb, AccentColor 40%, transparent));
}

.zen-sidebar-drag-placeholder {
  width: var(--zen-icon-size, 36px); min-height: var(--zen-icon-size, 36px);
  border-radius: var(--zen-icon-radius, 10px);
  margin: 0 auto;
  background: var(--zen-primary-color, AccentColor);
  opacity: 0.2;
}

/* ── Context Menu ──────────────────────────────────────────── */
#zen-sidebar-ctx-menu { appearance: auto; -moz-default-appearance: menupopup; }

/* ── Auto-Hide Animation ─────────────────────────────────── */
#zen-sidebar-box[data-auto-hide] #zen-sidebar-toolbar {
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease,
              border-width 0.2s ease;
  overflow: hidden;
}
#zen-sidebar-toolbar[data-auto-hide-hidden] {
  opacity: 0; pointer-events: none;
  width: 0 !important; min-width: 0 !important; max-width: 0 !important;
  padding: 0 !important; border-width: 0 !important;
}
/* Collapse the entire sidebar box when toolbar is hidden and no panel is open */
#zen-sidebar-box[data-auto-hide-collapsed] {
  min-width: 0 !important; width: 0 !important;
  overflow: hidden;
}

/* ── Smooth Resize-Mode Content Push ─────────────────────── */
/* appcontent margin is set/cleared synchronously — no transition needed */

/* ── Animation Toggle ─────────────────────────────────────── */
#zen-sidebar-box[data-no-animations] *,
#zen-sidebar-box[data-no-animations] { transition: none !important; }

/* ── Settings Gear Button ─────────────────────────────────── */
#zen-sidebar-settings-btn {
  appearance: none;
  width: var(--zen-icon-size, 36px); height: var(--zen-icon-size, 36px);
  min-width: var(--zen-icon-size, 36px); min-height: var(--zen-icon-size, 36px);
  border-radius: var(--zen-icon-radius, 10px); background: transparent; border: none;
  cursor: pointer; padding: 0; opacity: 0.4;
  margin: 8px auto; flex-shrink: 0;
  transition: opacity 0.15s, background 0.15s;
  -moz-box-pack: center; -moz-box-align: center;
}
#zen-sidebar-settings-btn .toolbarbutton-icon {
  width: 16px; height: 16px;
  -moz-context-properties: fill; fill: var(--toolbar-color, #fbfbfe);
}
#zen-sidebar-settings-btn .toolbarbutton-text { display: none; }
#zen-sidebar-settings-btn:hover { opacity: 1; background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08)); }

/* ── Settings Dialog ──────────────────────────────────────── */
.zen-settings-popup {
  --panel-background: var(--arrowpanel-background, #2b2a33);
  --panel-color: var(--arrowpanel-color, #fbfbfe);
  --panel-border-color: var(--arrowpanel-border-color, rgba(255,255,255,0.1));
  appearance: none;
  background: var(--panel-background);
  color: var(--panel-color);
  border: 1px solid var(--panel-border-color);
  border-radius: 12px;
  padding: 0;
  min-width: 300px; max-width: 360px;
  max-height: 80vh;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.zen-settings-content {
  display: flex; flex-direction: column; gap: 6px;
  padding: 16px;
  overflow-y: auto; max-height: 70vh;
}
.zen-settings-title {
  font-size: 14px; font-weight: 600;
  margin-bottom: 4px;
}
.zen-settings-label {
  font-size: 12px; opacity: 0.8;
  white-space: nowrap; flex-shrink: 0;
}
.zen-settings-row {
  display: flex; align-items: center; gap: 8px;
  min-height: 28px;
}
.zen-settings-row .zen-settings-input,
.zen-settings-row .zen-settings-menulist {
  width: auto; flex: 1; min-width: 0;
}
.zen-settings-input {
  background: rgba(255,255,255,0.07);
  color: var(--panel-color);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  font-family: inherit;
}
.zen-settings-input:focus {
  border-color: var(--zen-primary-color, AccentColor);
}
.zen-settings-input-short { width: 80px; flex-shrink: 0; }
.zen-settings-color {
  width: 32px; height: 28px; padding: 2px; border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px; background: transparent; cursor: pointer; flex-shrink: 0;
}
.zen-settings-range {
  flex: 1; min-width: 60px; height: 4px; accent-color: var(--zen-primary-color, AccentColor);
}
/* XUL checkbox */
.zen-settings-check {
  margin: 4px 0;
  font-size: 12px;
}
.zen-settings-check > .checkbox-label { opacity: 0.9; }
/* XUL menulist (dropdown) */
.zen-settings-menulist {
  appearance: none;
  background: rgba(255,255,255,0.07);
  color: var(--panel-color, #fbfbfe);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  min-height: 28px;
  width: 100%;
}
.zen-settings-menulist > .menulist-label-box { flex: 1; }
.zen-settings-menulist > dropmarker { display: -moz-box; margin-inline-start: 4px; }
.zen-settings-btn-row {
  display: flex; gap: 8px; margin-top: 8px;
  justify-content: flex-end;
}
.zen-settings-btn {
  background: rgba(255,255,255,0.08);
  color: var(--panel-color);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.zen-settings-btn:hover { background: rgba(255,255,255,0.14); }
.zen-settings-btn-primary {
  background: var(--zen-primary-color, AccentColor);
  border-color: transparent;
  color: #fff;
}
.zen-settings-btn-primary:hover { opacity: 0.9; }
.zen-settings-btn-small {
  background: rgba(255,255,255,0.08);
  color: var(--panel-color);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
}
.zen-settings-btn-small:hover { background: rgba(255,255,255,0.14); }
`;

  // ═══════════════════════════════════════════════════════════════
  // Initialize
  // ═══════════════════════════════════════════════════════════════

  function initSidebar() {
    console.log("[ZenSidebar] Script loaded, readyState:", document.readyState);
    const win = window;
    if (!win.document) {
      console.warn("[ZenSidebar] No document, aborting.");
      return;
    }
    // Check for main browser chrome elements
    const containerCandidates = ["browser", "tabbrowser-tabbox", "content-deck"];
    const found = containerCandidates.find((id) => win.document.getElementById(id));
    if (!found) {
      console.warn("[ZenSidebar] No browser chrome container found, aborting. Tried:", containerCandidates.join(", "));
      return;
    }
    console.log("[ZenSidebar] Found container:", found);
    const sidebar = new ZenSidebar(win);
    sidebar.init();
    win.addEventListener("unload", () => sidebar.destroy(), { once: true });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    initSidebar();
  } else {
    document.addEventListener("DOMContentLoaded", initSidebar, { once: true });
  }
})();
