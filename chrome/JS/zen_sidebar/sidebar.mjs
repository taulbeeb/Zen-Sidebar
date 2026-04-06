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
    this._mode = "overlay";
  }

  init() {
    console.log("[ZenSidebar] Initializing...");
    this._loadPrefs();
    this._buildDOM();
    this._injectInlineCSS();
    this._addToolbarButton();
    this._registerKeybinding();
    this._restorePanels();
    console.log("[ZenSidebar] Ready.");
  }

  destroy() {
    this._removeKeybinding();
    this._savePrefs();
    for (const el of [
      this._sidebarBox,
      this._splitter,
      this._styleEl,
      this._inlineStyleEl,
      this._toolbarBtn,
    ]) {
      if (el) el.remove();
    }
  }

  // ── DOM Construction ──────────────────────────────────────────────

  _buildDOM() {
    const containerCandidates = [
      "browser",
      "tabbrowser-tabbox",
      "content-deck",
    ];
    let container = null;
    for (const id of containerCandidates) {
      container = this.doc.getElementById(id);
      if (container) break;
    }
    if (!container) container = this.doc.documentElement;
    this._container = container;

    // Main sidebar container
    this._sidebarBox = this._el("vbox", {
      id: "zen-sidebar-box",
      hidden: "true",
    });

    // Splitter
    this._splitter = this._el("splitter", {
      id: "zen-sidebar-splitter",
      hidden: "true",
    });
    this._splitter.addEventListener("mousedown", () => this._onSplitterDrag());

    // ── Navigation toolbar (replaces old header) ──
    this._navBar = this._el("hbox", {
      id: "zen-sidebar-navbar",
      align: "center",
    });

    const backBtn = this._navBtn("zen-sb-back", "Back", "chrome://global/skin/icons/arrow-left.svg", () => this._navAction("back"));
    const fwdBtn = this._navBtn("zen-sb-forward", "Forward", "chrome://global/skin/icons/arrow-right.svg", () => this._navAction("forward"));
    const reloadBtn = this._navBtn("zen-sb-reload", "Reload", "chrome://global/skin/icons/reload.svg", () => this._navAction("reload"));
    const homeBtn = this._navBtn("zen-sb-home", "Go to panel URL", "chrome://global/skin/icons/home.svg", () => this._navAction("home"));

    // Spacer
    const spacer = this._el("spacer", { flex: "1" });

    // Mode toggle
    const modeBtn = this._navBtn("zen-sb-mode", "Toggle overlay/resize", null, () => this.toggleMode());
    modeBtn.setAttribute("data-mode", this._mode);

    // Close
    const closeBtn = this._navBtn("zen-sb-close", "Close sidebar", "chrome://global/skin/icons/close.svg", () => this.toggle());
    closeBtn.classList.add("zen-sb-close-btn");

    this._navBar.append(backBtn, fwdBtn, reloadBtn, homeBtn, spacer, modeBtn, closeBtn);

    // Panel container
    this._panelContainer = this._el("vbox", {
      id: "zen-sidebar-panel-container",
      flex: "1",
    });

    // Vertical icon toolbar
    const toolbarEl = this.toolbar.build();

    // Assemble
    this._sidebarBox.append(this._navBar, this._panelContainer, toolbarEl);
    this._sidebarBox.style.width = `${this._getWidth()}px`;
    container.append(this._splitter, this._sidebarBox);
    this._applyMode();
  }

  _navBtn(id, tooltip, iconUrl, handler) {
    const btn = this._el("toolbarbutton", {
      id,
      tooltiptext: tooltip,
      class: "zen-sb-nav-btn",
    });
    if (iconUrl) {
      btn.setAttribute("image", iconUrl);
    }
    btn.addEventListener("command", handler);
    return btn;
  }

  // ── Navigation Actions ────────────────────────────────────────────

  _navAction(action) {
    const panel = this.panelManager.activePanel;
    if (!panel || !panel._browser) return;
    const browser = panel._browser;
    switch (action) {
      case "back":
        browser.goBack();
        break;
      case "forward":
        browser.goForward();
        break;
      case "reload":
        browser.reload();
        break;
      case "home":
        browser.setAttribute("src", panel.url);
        break;
    }
  }

  // ── Navbar visibility per panel ───────────────────────────────────

  updateNavBarVisibility() {
    const panel = this.panelManager.activePanel;
    if (!panel) return;
    if (panel.showToolbar === false) {
      this._navBar.setAttribute("collapsed", "true");
    } else {
      this._navBar.removeAttribute("collapsed");
    }
  }

  // ── Toolbar Button (nav bar) ──────────────────────────────────────

  _addToolbarButton() {
    const navBar =
      this.doc.getElementById("nav-bar") ||
      this.doc.querySelector("toolbar");
    if (!navBar) return;

    const target =
      navBar.querySelector("#nav-bar-customization-target") || navBar;

    this._toolbarBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-toggle-toolbar-btn",
      class: "toolbarbutton-1 chromeclass-toolbar-additional",
      tooltiptext: "Web Panels (Ctrl+Shift+E)",
      removable: "true",
    });
    this._toolbarBtn.addEventListener("command", () => this.toggle());
    target.appendChild(this._toolbarBtn);
  }

  // ── Visibility ────────────────────────────────────────────────────

  get visible() {
    return this._visible;
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  show() {
    if (!this._sidebarBox) return;
    this._visible = true;
    this._sidebarBox.removeAttribute("hidden");
    this._splitter.removeAttribute("hidden");
    this._applyMode();
    this.updateNavBarVisibility();

    const active = this.panelManager.activePanel;
    if (active) {
      active.load();
    }
  }

  hide() {
    this._visible = false;
    this._sidebarBox.setAttribute("hidden", "true");
    this._splitter.setAttribute("hidden", "true");
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

    const modeBtn = this.doc.getElementById("zen-sb-mode");
    if (modeBtn) {
      modeBtn.setAttribute("data-mode", this._mode);
      modeBtn.setAttribute(
        "tooltiptext",
        this._mode === "overlay" ? "Switch to resize mode" : "Switch to overlay mode"
      );
    }

    if (this._visible) {
      this._mode === "resize" ? this._pushContent() : this._clearResize();
    }
  }

  _pushContent() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) appcontent.style.marginRight = `${this._getWidth()}px`;
  }

  _clearResize() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) appcontent.style.marginRight = "";
  }

  // ── Splitter / Resize ─────────────────────────────────────────────

  _onSplitterDrag() {
    const onMouseMove = (e) => {
      const rect = this._container.getBoundingClientRect();
      const w = Math.max(200, Math.min(800, rect.right - e.clientX));
      this._sidebarBox.style.width = `${w}px`;
      if (this._mode === "resize") this._pushContent();
    };
    const onMouseUp = () => {
      this.doc.removeEventListener("mousemove", onMouseMove);
      this.doc.removeEventListener("mouseup", onMouseUp);
      const w = parseInt(this._sidebarBox.style.width, 10);
      if (w) Services.prefs.setIntPref(PREF_WIDTH, w);
    };
    this.doc.addEventListener("mousemove", onMouseMove);
    this.doc.addEventListener("mouseup", onMouseUp);
  }

  // ── Panel Management ──────────────────────────────────────────────

  switchToPanel(panel) {
    this.panelManager.switchTo(panel);
    this.updateNavBarVisibility();
    if (!this._visible) this.show();
  }

  // ── Keyboard Shortcut ─────────────────────────────────────────────

  _registerKeybinding() {
    this._keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        this.toggle();
      }
    };
    this.win.addEventListener("keydown", this._keyHandler);
  }

  _removeKeybinding() {
    if (this._keyHandler) this.win.removeEventListener("keydown", this._keyHandler);
  }

  // ── Preferences ───────────────────────────────────────────────────

  _loadPrefs() {
    try {
      this._mode = Services.prefs.getStringPref(PREF_MODE, "overlay") || "overlay";
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
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  // ── Inline CSS ────────────────────────────────────────────────────

  _injectInlineCSS() {
    const style = this.doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.textContent = CSS_TEXT;
    this.doc.documentElement.appendChild(style);
    this._inlineStyleEl = style;
  }
}

// All styles in one place
const CSS_TEXT = `
/* ── Sidebar Container ─────────────────────────────────────── */
#zen-sidebar-box {
  display: grid;
  grid-template-columns: 1fr 42px;
  grid-template-rows: auto 1fr;
  background: var(--toolbar-bgcolor, #1c1b22);
  border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.15));
  min-width: 250px;
  max-width: 50vw;
  font-family: system-ui, -apple-system, sans-serif;
}
#zen-sidebar-box[hidden="true"] { display: none !important; }
#zen-sidebar-box[data-mode="overlay"] {
  position: fixed; right: 0; top: 0; bottom: 0; z-index: 10000;
  box-shadow: -2px 0 12px rgba(0,0,0,0.25);
}
#zen-sidebar-box[data-mode="resize"] { position: relative; z-index: 1; }

/* ── Splitter ──────────────────────────────────────────────── */
#zen-sidebar-splitter {
  width: 3px; min-width: 3px; border: none; cursor: ew-resize;
  background: transparent; z-index: 10001;
}
#zen-sidebar-splitter:hover { background: var(--zen-primary-color, color-mix(in srgb, AccentColor 80%, transparent)); }

/* ── Nav Bar ───────────────────────────────────────────────── */
#zen-sidebar-navbar {
  grid-column: 1 / -1; grid-row: 1;
  display: flex; align-items: center; gap: 1px;
  padding: 4px 6px;
  background: var(--toolbar-bgcolor, #1c1b22);
  border-bottom: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
  min-height: 32px;
}
#zen-sidebar-navbar[collapsed="true"] { display: none; }

.zen-sb-nav-btn {
  appearance: none;
  width: 28px; height: 28px;
  border-radius: 6px;
  background: transparent; border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}
.zen-sb-nav-btn .toolbarbutton-icon {
  width: 14px; height: 14px;
  -moz-context-properties: fill;
  fill: var(--toolbar-color, #fbfbfe);
}
.zen-sb-nav-btn:hover { background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08)); opacity: 1; }
.zen-sb-nav-btn:active { background: var(--toolbarbutton-active-background, rgba(255,255,255,0.12)); }
.zen-sb-close-btn:hover { background: rgba(255,70,70,0.25) !important; opacity: 1; }

/* Mode toggle icon */
#zen-sb-mode .toolbarbutton-icon { display: none; }
#zen-sb-mode::after {
  content: ""; width: 14px; height: 14px;
  background: var(--toolbar-color, #fbfbfe);
  mask-size: contain; mask-repeat: no-repeat; mask-position: center;
  opacity: 0.7;
}
#zen-sb-mode[data-mode="overlay"]::after {
  mask-image: url("chrome://global/skin/icons/open-in-new.svg");
}
#zen-sb-mode[data-mode="resize"]::after {
  mask-image: url("chrome://global/skin/icons/arrow-left.svg");
}

/* ── Panel Container ───────────────────────────────────────── */
#zen-sidebar-panel-container {
  grid-column: 1; grid-row: 2;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.zen-sidebar-web-panel-browser {
  flex: 1; border: none;
  background: var(--toolbar-bgcolor, #1c1b22);
}

/* ── Icon Toolbar (vertical strip) ─────────────────────────── */
#zen-sidebar-toolbar {
  grid-column: 2; grid-row: 2;
  display: flex; flex-direction: column;
  width: 42px; min-width: 42px;
  background: var(--toolbar-bgcolor, #1c1b22);
  border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
  padding: 6px 0;
}
#zen-sidebar-toolbar-icons {
  display: flex; flex-direction: column;
  align-items: center; gap: 2px;
  overflow-y: auto; overflow-x: hidden;
  padding: 2px 0; flex: 1;
}
#zen-sidebar-toolbar-bottom {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 0;
  border-top: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
}

/* ── Panel Icons ───────────────────────────────────────────── */
.zen-sidebar-panel-icon {
  appearance: none;
  width: 32px; height: 32px;
  border-radius: 8px;
  background: transparent;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 3px;
  position: relative;
  transition: background 0.12s, border-color 0.12s;
}
.zen-sidebar-panel-icon .toolbarbutton-icon { width: 18px; height: 18px; }
.zen-sidebar-panel-icon:hover {
  background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08));
}
.zen-sidebar-panel-icon[data-active="true"] {
  background: var(--toolbarbutton-active-background, rgba(255,255,255,0.12));
  border-color: var(--zen-primary-color, AccentColor);
}

/* Container color dot */
.zen-sidebar-panel-icon[data-container-color]::after {
  content: ""; position: absolute; bottom: 1px; right: 1px;
  width: 7px; height: 7px; border-radius: 50%;
  border: 1px solid var(--toolbar-bgcolor, #1c1b22);
}
.zen-sidebar-panel-icon[data-container-color="blue"]::after { background: #37adff; }
.zen-sidebar-panel-icon[data-container-color="turquoise"]::after { background: #00c79a; }
.zen-sidebar-panel-icon[data-container-color="green"]::after { background: #51cd00; }
.zen-sidebar-panel-icon[data-container-color="yellow"]::after { background: #ffcb00; }
.zen-sidebar-panel-icon[data-container-color="orange"]::after { background: #ff9f00; }
.zen-sidebar-panel-icon[data-container-color="red"]::after { background: #ff613d; }
.zen-sidebar-panel-icon[data-container-color="pink"]::after { background: #ff4bda; }
.zen-sidebar-panel-icon[data-container-color="purple"]::after { background: #af51f5; }

/* ── Add Button ────────────────────────────────────────────── */
#zen-sidebar-add-btn {
  appearance: none; width: 32px; height: 32px;
  border-radius: 8px; background: transparent;
  border: 1.5px dashed rgba(128,128,128,0.3);
  cursor: pointer; color: var(--toolbar-color, #fbfbfe);
  font-size: 18px; font-weight: 300;
  opacity: 0.6; transition: opacity 0.15s, border-color 0.15s;
}
#zen-sidebar-add-btn:hover {
  opacity: 1; border-color: var(--zen-primary-color, AccentColor);
}

/* ── Nav bar toggle toolbar button ─────────────────────────── */
#zen-sidebar-toggle-toolbar-btn {
  list-style-image: url("chrome://global/skin/icons/developer.svg");
}

/* ── Context Menu ──────────────────────────────────────────── */
#zen-sidebar-ctx-menu { appearance: auto; -moz-default-appearance: menupopup; }
`;
