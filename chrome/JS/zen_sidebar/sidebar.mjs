import { PanelManager } from "./panel_manager.mjs";
import { Toolbar } from "./toolbar.mjs";
import { WebPanel } from "./web_panel.mjs";

const PREF_PANELS = "zen.sidebar.panels";
const PREF_MODE = "zen.sidebar.mode";
const PREF_WIDTH = "zen.sidebar.width";
const SIDEBAR_DEFAULT_WIDTH = 400;

export class ZenSidebar {
  constructor(win) {
    this.win = win;
    this.doc = win.document;
    this.panelManager = new PanelManager(this);
    this.toolbar = new Toolbar(this);
    this._visible = false;
    this._mode = "overlay"; // "overlay" or "resize"
  }

  init() {
    console.log("[ZenSidebar] Initializing...");
    this._loadPrefs();
    this._buildDOM();
    this._loadCSS();
    this._addToolbarButton();
    this._registerKeybinding();
    this._restorePanels();
    console.log("[ZenSidebar] Initialization complete. Press Cmd+Shift+E or click the toolbar button to toggle.");
  }

  destroy() {
    this._removeKeybinding();
    this._savePrefs();
    if (this._sidebarBox) {
      this._sidebarBox.remove();
    }
    if (this._splitter) {
      this._splitter.remove();
    }
    if (this._styleEl) {
      this._styleEl.remove();
    }
    if (this._toolbarBtn) {
      this._toolbarBtn.remove();
    }
  }

  // ── DOM Construction ──────────────────────────────────────────────

  _buildDOM() {
    // Try multiple possible container element IDs for Zen/Firefox
    const containerCandidates = [
      "browser",
      "tabbrowser-tabbox",
      "content-deck",
      "navigator-toolbox",
    ];

    let container = null;
    for (const id of containerCandidates) {
      container = this.doc.getElementById(id);
      if (container) {
        console.log(`[ZenSidebar] Found container element: #${id}`);
        break;
      }
    }

    if (!container) {
      // Last resort: try to find the main browser area by tag/class
      container =
        this.doc.querySelector("#browser") ||
        this.doc.querySelector("hbox#browser") ||
        this.doc.querySelector("[id*='browser']") ||
        this.doc.documentElement;
      console.warn(
        "[ZenSidebar] Could not find standard container, using fallback:",
        container?.id || container?.tagName
      );
    }

    this._container = container;

    // Main sidebar container
    this._sidebarBox = this._el("vbox", {
      id: "zen-sidebar-box",
      hidden: "true",
    });

    // Splitter for manual resize
    this._splitter = this._el("splitter", {
      id: "zen-sidebar-splitter",
      hidden: "true",
      resizebefore: "none",
      resizeafter: "closest",
    });
    this._splitter.addEventListener("mousedown", () => this._onSplitterDrag());

    // Sidebar header
    const header = this._el("hbox", {
      id: "zen-sidebar-header",
      align: "center",
    });

    const titleLabel = this._el("label", {
      id: "zen-sidebar-title",
      value: "Web Panel",
      flex: "1",
      crop: "end",
    });

    const headerButtons = this._el("hbox", {
      id: "zen-sidebar-header-buttons",
    });

    const modeToggleBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-mode-toggle",
      tooltiptext: "Toggle overlay/resize mode",
      class: "zen-sidebar-header-btn",
    });
    modeToggleBtn.addEventListener("command", () => this.toggleMode());

    const closeBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-close",
      tooltiptext: "Close sidebar",
      class: "zen-sidebar-header-btn",
    });
    closeBtn.addEventListener("command", () => this.toggle());

    headerButtons.append(modeToggleBtn, closeBtn);
    header.append(titleLabel, headerButtons);

    // Panel container (holds the <browser> elements for web panels)
    this._panelContainer = this._el("vbox", {
      id: "zen-sidebar-panel-container",
      flex: "1",
    });

    // Build toolbar (vertical icon strip)
    const toolbarEl = this.toolbar.build();

    // Assemble sidebar
    this._sidebarBox.append(header, this._panelContainer, toolbarEl);

    // Set initial width
    const width = this._getWidth();
    this._sidebarBox.style.width = `${width}px`;

    // Insert at the right end of the container
    container.append(this._splitter, this._sidebarBox);

    // Update mode class
    this._applyMode();

    console.log("[ZenSidebar] DOM built and appended to", container.id || container.tagName);
  }

  _loadCSS() {
    // Try multiple chrome URL patterns for different loaders
    const cssPaths = [
      "chrome://userscripts/content/zen_sidebar/sidebar.css",
      "chrome://userchrome/content/JS/zen_sidebar/sidebar.css",
      "chrome://userchromejs/content/zen_sidebar/sidebar.css",
    ];

    // Try loading via processing instruction
    let loaded = false;
    for (const cssURL of cssPaths) {
      try {
        const pi = this.doc.createProcessingInstruction(
          "xml-stylesheet",
          `href="${cssURL}" type="text/css"`
        );
        this.doc.insertBefore(pi, this.doc.documentElement);
        this._styleEl = pi;
        console.log("[ZenSidebar] CSS loaded via PI:", cssURL);
        loaded = true;
        break;
      } catch (e) {
        console.warn("[ZenSidebar] CSS PI failed for", cssURL, e);
      }
    }

    // Fallback: inject styles inline
    if (!loaded) {
      console.log("[ZenSidebar] Falling back to inline CSS injection");
    }

    // Always inject critical inline styles as a safety net
    this._injectInlineCSS();
  }

  _injectInlineCSS() {
    const style = this.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "style"
    );
    style.setAttribute("type", "text/css");
    style.textContent = `
      #zen-sidebar-box {
        display: grid;
        grid-template-columns: 1fr 48px;
        grid-template-rows: auto 1fr;
        background-color: var(--toolbar-bgcolor, #1c1b22);
        border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.3));
        min-width: 250px;
        max-width: 50vw;
      }
      #zen-sidebar-box[data-mode="overlay"] {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 10000;
        box-shadow: -4px 0 16px rgba(0,0,0,0.3);
      }
      #zen-sidebar-box[data-mode="resize"] {
        position: relative;
        z-index: 1;
      }
      #zen-sidebar-box[hidden="true"] {
        display: none !important;
      }
      #zen-sidebar-header {
        grid-column: 1; grid-row: 1;
        display: flex; align-items: center;
        padding: 6px 10px;
        background-color: var(--toolbar-bgcolor, #2b2a33);
        border-bottom: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.3));
        min-height: 36px;
      }
      #zen-sidebar-title {
        color: var(--toolbar-color, #fbfbfe);
        font-size: 13px; font-weight: 600;
        margin-inline-start: 8px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #zen-sidebar-header-buttons { display: flex; gap: 2px; margin-inline-start: auto; }
      .zen-sidebar-header-btn {
        appearance: none; width: 28px; height: 28px;
        border-radius: 4px; background: transparent;
        border: none; color: var(--toolbar-color, #fbfbfe); cursor: pointer;
      }
      .zen-sidebar-header-btn:hover { background-color: rgba(255,255,255,0.08); }
      #zen-sidebar-close:hover { background-color: rgba(255,80,80,0.3); }
      #zen-sidebar-panel-container {
        grid-column: 1; grid-row: 2;
        display: flex; flex-direction: column;
        overflow: hidden; background-color: var(--toolbar-bgcolor, #1c1b22);
      }
      .zen-sidebar-web-panel-browser { flex: 1; border: none; background-color: white; }
      #zen-sidebar-toolbar {
        grid-column: 2; grid-row: 1 / -1;
        display: flex; flex-direction: column;
        width: 48px; min-width: 48px;
        background-color: var(--toolbar-bgcolor, #1c1b22);
        border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.3));
        padding: 6px 0;
      }
      #zen-sidebar-toolbar-icons {
        display: flex; flex-direction: column;
        align-items: center; gap: 4px;
        overflow-y: auto; padding: 4px 0; flex: 1;
      }
      #zen-sidebar-toolbar-bottom {
        display: flex; flex-direction: column; align-items: center;
        margin-top: auto; padding: 4px 0;
        border-top: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.3));
      }
      .zen-sidebar-panel-icon {
        appearance: none; width: 36px; height: 36px;
        border-radius: 8px; background: transparent;
        border: 2px solid transparent; cursor: pointer;
        padding: 4px; position: relative;
      }
      .zen-sidebar-panel-icon .toolbarbutton-icon { width: 20px; height: 20px; }
      .zen-sidebar-panel-icon:hover { background-color: rgba(255,255,255,0.08); }
      .zen-sidebar-panel-icon[data-active="true"] {
        background-color: rgba(255,255,255,0.15);
        border-color: var(--zen-primary-color, #7b68ee);
      }
      #zen-sidebar-add-btn {
        appearance: none; width: 36px; height: 36px;
        border-radius: 8px; background: transparent;
        border: 2px dashed rgba(128,128,128,0.4); cursor: pointer;
        color: var(--toolbar-color, #fbfbfe); font-size: 20px; font-weight: 300;
      }
      #zen-sidebar-add-btn:hover {
        background-color: rgba(255,255,255,0.08);
        border-color: var(--zen-primary-color, #7b68ee);
      }
      #zen-sidebar-splitter {
        width: 4px; min-width: 4px;
        background-color: transparent; border: none; cursor: ew-resize;
      }
      #zen-sidebar-splitter:hover { background-color: var(--zen-primary-color, #7b68ee); }
      #zen-sidebar-toggle-toolbar-btn {
        list-style-image: url("chrome://global/skin/icons/settings.svg");
      }
    `;
    this.doc.documentElement.appendChild(style);
    this._inlineStyleEl = style;
  }

  // ── Toolbar Button (visible in the browser nav bar) ───────────────

  _addToolbarButton() {
    // Find a toolbar to add the button to
    const navBar =
      this.doc.getElementById("nav-bar") ||
      this.doc.getElementById("toolbar-menubar") ||
      this.doc.querySelector("toolbar");

    if (!navBar) {
      console.warn("[ZenSidebar] No toolbar found for toggle button");
      return;
    }

    const customizableArea =
      navBar.querySelector("#nav-bar-customization-target") ||
      navBar;

    this._toolbarBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-toggle-toolbar-btn",
      class: "toolbarbutton-1 chromeclass-toolbar-additional",
      label: "Web Panels",
      tooltiptext: "Toggle Web Panels Sidebar (Ctrl+Shift+E)",
      removable: "true",
    });
    this._toolbarBtn.addEventListener("command", () => this.toggle());

    customizableArea.appendChild(this._toolbarBtn);
    console.log("[ZenSidebar] Toolbar button added to", navBar.id);
  }

  // ── Visibility ────────────────────────────────────────────────────

  get visible() {
    return this._visible;
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  show() {
    if (!this._sidebarBox) {
      console.error("[ZenSidebar] Cannot show - sidebar DOM not built");
      return;
    }
    this._visible = true;
    this._sidebarBox.removeAttribute("hidden");
    this._splitter.removeAttribute("hidden");
    this._sidebarBox.classList.add("zen-sidebar-open");
    this._applyMode();

    // Load active panel if needed
    const active = this.panelManager.activePanel;
    if (active) {
      active.load();
      this._updateTitle(active.label);
    }
  }

  hide() {
    this._visible = false;
    this._sidebarBox.setAttribute("hidden", "true");
    this._splitter.setAttribute("hidden", "true");
    this._sidebarBox.classList.remove("zen-sidebar-open");

    // Undo resize mode push
    this._clearResize();
  }

  // ── Mode Toggle ───────────────────────────────────────────────────

  get mode() {
    return this._mode;
  }

  toggleMode() {
    this._mode = this._mode === "overlay" ? "resize" : "overlay";
    this._applyMode();
    this._savePrefs();
  }

  _applyMode() {
    const box = this._sidebarBox;
    if (!box) return;

    box.setAttribute("data-mode", this._mode);

    const modeBtn = this.doc.getElementById("zen-sidebar-mode-toggle");
    if (modeBtn) {
      modeBtn.setAttribute(
        "tooltiptext",
        this._mode === "overlay"
          ? "Switch to resize mode"
          : "Switch to overlay mode"
      );
      modeBtn.setAttribute("data-mode", this._mode);
    }

    if (this._visible) {
      if (this._mode === "resize") {
        this._pushContent();
      } else {
        this._clearResize();
      }
    }
  }

  _pushContent() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) {
      appcontent.style.marginRight = `${this._getWidth()}px`;
    }
  }

  _clearResize() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) {
      appcontent.style.marginRight = "";
    }
  }

  // ── Splitter / Resize ─────────────────────────────────────────────

  _onSplitterDrag() {
    const onMouseMove = (e) => {
      const rect = this._container.getBoundingClientRect();
      const newWidth = Math.max(200, Math.min(800, rect.right - e.clientX));
      this._sidebarBox.style.width = `${newWidth}px`;
      if (this._mode === "resize") {
        this._pushContent();
      }
    };

    const onMouseUp = () => {
      this.doc.removeEventListener("mousemove", onMouseMove);
      this.doc.removeEventListener("mouseup", onMouseUp);
      // Persist width
      const w = parseInt(this._sidebarBox.style.width, 10);
      if (w) {
        Services.prefs.setIntPref(PREF_WIDTH, w);
      }
    };

    this.doc.addEventListener("mousemove", onMouseMove);
    this.doc.addEventListener("mouseup", onMouseUp);
  }

  // ── Panel Management (delegates to PanelManager) ──────────────────

  switchToPanel(panel) {
    this.panelManager.switchTo(panel);
    this._updateTitle(panel.label);
    if (!this._visible) {
      this.show();
    }
  }

  _updateTitle(title) {
    const label = this.doc.getElementById("zen-sidebar-title");
    if (label) {
      label.setAttribute("value", title || "Web Panel");
    }
  }

  // ── Keyboard Shortcut ─────────────────────────────────────────────

  _registerKeybinding() {
    this._keyHandler = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "e"
      ) {
        e.preventDefault();
        this.toggle();
      }
    };
    this.win.addEventListener("keydown", this._keyHandler);
  }

  _removeKeybinding() {
    if (this._keyHandler) {
      this.win.removeEventListener("keydown", this._keyHandler);
    }
  }

  // ── Preferences / Persistence ─────────────────────────────────────

  _loadPrefs() {
    try {
      this._mode =
        Services.prefs.getStringPref(PREF_MODE, "overlay") || "overlay";
    } catch {
      this._mode = "overlay";
    }
  }

  _savePrefs() {
    Services.prefs.setStringPref(PREF_MODE, this._mode);
    this.panelManager.save();
  }

  _getWidth() {
    try {
      return Services.prefs.getIntPref(PREF_WIDTH, SIDEBAR_DEFAULT_WIDTH);
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  }

  _restorePanels() {
    this.panelManager.restore();
  }

  // ── Utility ───────────────────────────────────────────────────────

  _el(tag, attrs = {}) {
    const el = this.doc.createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }
}
