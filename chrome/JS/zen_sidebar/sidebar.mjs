import { PanelManager } from "./panel_manager.mjs";
import { Toolbar } from "./toolbar.mjs";

const PREF_MODE = "zen.sidebar.mode";
const PREF_WIDTH = "zen.sidebar.width";
const SIDEBAR_DEFAULT_WIDTH = 400;
const TOOLBAR_WIDTH = 48;

export class ZenSidebar {
  constructor(win) {
    this.win = win;
    this.doc = win.document;
    this.panelManager = new PanelManager(this);
    this.toolbar = new Toolbar(this);
    this._panelOpen = false;
    this._mode = "overlay";
  }

  init() {
    console.log("[ZenSidebar] Initializing...");
    this._loadPrefs();
    this._buildDOM();
    this._injectInlineCSS();
    this._registerKeybinding();
    this._restorePanels();
    this._sidebarBox.removeAttribute("hidden");
    console.log("[ZenSidebar] Ready.");
  }

  destroy() {
    this._removeKeybinding();
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
    const spacer = this._el("spacer", { flex: "1" });
    const modeBtn = this._navBtn("zen-sb-mode", "Toggle overlay/resize", null, () => this.toggleMode());
    modeBtn.setAttribute("data-mode", this._mode);
    const closeBtn = this._navBtn("zen-sb-close", "Close panel", "chrome://global/skin/icons/close.svg", () => this.collapsePanel());
    closeBtn.classList.add("zen-sb-close-btn");
    this._navBar.append(backBtn, fwdBtn, reloadBtn, homeBtn, spacer, modeBtn, closeBtn);

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

  updateNavBarVisibility() {
    const panel = this.panelManager.activePanel;
    if (!panel) return;
    if (panel.showToolbar === false) {
      this._navBar.setAttribute("collapsed", "true");
    } else {
      this._navBar.removeAttribute("collapsed");
    }
  }

  // ── Panel Expand / Collapse ───────────────────────────────────────

  get panelOpen() { return this._panelOpen; }

  expandPanel(panel) {
    this._panelOpen = true;
    this._panelArea.removeAttribute("hidden");
    this._dragHandle.style.display = "";
    this._sidebarBox.setAttribute("data-panel-open", "true");

    const width = (panel?.width || this._getWidth()) + TOOLBAR_WIDTH;
    this._sidebarBox.style.width = `${width}px`;

    this._applyMode();
    this.updateNavBarVisibility();
    if (panel) panel.load();
  }

  collapsePanel() {
    this._panelOpen = false;
    this._panelArea.setAttribute("hidden", "true");
    this._dragHandle.style.display = "none";
    this._sidebarBox.removeAttribute("data-panel-open");
    this._sidebarBox.style.width = "";
    this._clearResize();
    this.toolbar.clearActive();
  }

  switchToPanel(panel) {
    const active = this.panelManager.activePanel;
    if (active === panel && this._panelOpen) {
      this.collapsePanel();
      return;
    }
    this.panelManager.switchTo(panel);
    this.expandPanel(panel);
  }

  // ── Add/Edit Panel (using Services.prompt - reliable) ─────────────

  showAddPanelForm(editPanel = null) {
    const isEdit = !!editPanel;

    // 1. URL
    const url = { value: isEdit ? editPanel.url : "https://" };
    const urlOk = Services.prompt.prompt(
      this.win, isEdit ? "Edit Panel" : "Add Panel",
      "Web Page URL:", url, null, { value: false }
    );
    if (!urlOk || !url.value) return;

    let finalURL = url.value.trim();
    if (!/^https?:\/\//i.test(finalURL)) finalURL = "https://" + finalURL;

    // 2. Width
    const widthStr = { value: String(isEdit ? (editPanel.width || this._getWidth()) : this._getWidth()) };
    const widthOk = Services.prompt.prompt(
      this.win, isEdit ? "Edit Panel" : "Add Panel",
      "Panel Width (200-800):", widthStr, null, { value: false }
    );
    if (!widthOk) return;
    const width = Math.max(200, Math.min(800, parseInt(widthStr.value, 10) || this._getWidth()));

    // 3. Container
    const containers = this.panelManager.getContainers();
    let userContextId = 0;
    if (containers.length > 0) {
      const names = ["No Container", ...containers.map((c) => c.name)];
      const ids = [0, ...containers.map((c) => c.userContextId)];
      const selected = { value: isEdit ? Math.max(0, ids.indexOf(editPanel.userContextId || 0)) : 0 };
      const cOk = Services.prompt.select(
        this.win, "Container",
        "Open this panel in a container:", names, selected
      );
      if (!cOk) return;
      userContextId = ids[selected.value];
    }

    // 4. Mobile UA
    const mobileUA = { value: isEdit ? editPanel.mobileUA !== false : true };
    Services.prompt.confirmCheck(
      this.win, isEdit ? "Edit Panel" : "Add Panel",
      `URL: ${finalURL}\nWidth: ${width}`,
      "Use Mobile User Agent", mobileUA
    );

    // Apply
    if (isEdit) {
      editPanel.width = width;
      editPanel.mobileUA = mobileUA.value;
      this.panelManager.editPanel(editPanel, finalURL, null, null, userContextId);
    } else {
      this.panelManager.addPanel(finalURL, null, null, userContextId, {
        width,
        mobileUA: mobileUA.value,
      });
    }
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
    const w = parseInt(this._sidebarBox.style.width, 10) || this._getWidth() + TOOLBAR_WIDTH;
    if (appcontent) appcontent.style.marginRight = `${w}px`;
  }

  _clearResize() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) appcontent.style.marginRight = "";
  }

  // ── Drag Handle Resize (saves per-panel width) ─────────────────────

  _onDragResize(startEvent) {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidth = this._sidebarBox.getBoundingClientRect().width;

    const onMouseMove = (e) => {
      e.preventDefault();
      const delta = startX - e.clientX; // drag left = wider
      const totalW = Math.max(200 + TOOLBAR_WIDTH, Math.min(800 + TOOLBAR_WIDTH, startWidth + delta));
      this._sidebarBox.style.width = `${totalW}px`;
      if (this._mode === "resize") this._pushContent();
    };
    const onMouseUp = () => {
      this.doc.removeEventListener("mousemove", onMouseMove);
      this.doc.removeEventListener("mouseup", onMouseUp);
      // Save to active panel
      const totalW = parseInt(this._sidebarBox.style.width, 10) || 0;
      const panelW = totalW - TOOLBAR_WIDTH;
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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (this._panelOpen) {
          this.collapsePanel();
        } else {
          const active = this.panelManager.activePanel;
          if (active) this.switchToPanel(active);
        }
      }
    };
    this.win.addEventListener("keydown", this._keyHandler);
  }

  _removeKeybinding() {
    if (this._keyHandler) this.win.removeEventListener("keydown", this._keyHandler);
  }

  // ── Preferences ───────────────────────────────────────────────────

  _loadPrefs() {
    try { this._mode = Services.prefs.getStringPref(PREF_MODE, "overlay") || "overlay"; }
    catch { this._mode = "overlay"; }
  }

  _savePrefs() {
    Services.prefs.setStringPref(PREF_MODE, this._mode);
    this.panelManager.save();
  }

  _getWidth() {
    try { return Services.prefs.getIntPref(PREF_WIDTH, SIDEBAR_DEFAULT_WIDTH); }
    catch { return SIDEBAR_DEFAULT_WIDTH; }
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
}
#zen-sidebar-box[hidden="true"] { display: none !important; }
#zen-sidebar-box[data-panel-open][data-mode="overlay"] {
  position: fixed; right: 0; top: 0; bottom: 0; z-index: 10000;
  box-shadow: -2px 0 12px rgba(0,0,0,0.25);
}
#zen-sidebar-box[data-panel-open][data-mode="resize"] {
  position: relative; z-index: 1;
}

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
  margin: 8px 8px 8px 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
}
#zen-sidebar-panel-area[hidden="true"] { display: none !important; }

/* ── Nav Bar ───────────────────────────────────────────────── */
#zen-sidebar-navbar {
  display: flex; align-items: center; gap: 2px;
  padding: 4px 6px;
  min-height: 34px; flex-shrink: 0;
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
  width: ${TOOLBAR_WIDTH}px; min-width: ${TOOLBAR_WIDTH}px; max-width: ${TOOLBAR_WIDTH}px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.1);
  padding: 8px 0;
  box-sizing: border-box;
  border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
}
#zen-sidebar-toolbar-icons {
  display: flex; flex-direction: column;
  align-items: center; gap: 4px;
  overflow-y: auto; overflow-x: hidden;
  padding: 0; flex: 1;
}

/* ── Panel Icons ───────────────────────────────────────────── */
.zen-sidebar-panel-icon {
  appearance: none;
  width: 36px; height: 36px; min-width: 36px; min-height: 36px;
  border-radius: 10px; background: transparent;
  border: 2px solid transparent;
  cursor: grab;
  padding: 0;
  position: relative;
  transition: background 0.12s, border-color 0.12s;
  box-sizing: border-box;
  -moz-box-pack: center; -moz-box-align: center;
}
.zen-sidebar-panel-icon .toolbarbutton-icon {
  width: 20px; height: 20px;
}
.zen-sidebar-panel-icon .toolbarbutton-text { display: none; }
.zen-sidebar-panel-icon:hover {
  background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08));
}
.zen-sidebar-panel-icon[data-active="true"] {
  background: var(--toolbarbutton-active-background, rgba(255,255,255,0.12));
  border-color: var(--zen-primary-color, AccentColor);
}

/* Container color dot */
.zen-sidebar-panel-icon[data-container-color]::after {
  content: ""; position: absolute; bottom: 0px; right: 0px;
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid var(--toolbar-bgcolor, #1c1b22);
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
  appearance: none;
  width: 36px; height: 36px; min-width: 36px; min-height: 36px;
  border-radius: 10px; background: transparent;
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
.zen-sidebar-drag-placeholder {
  width: 36px; min-height: 36px;
  border-radius: 10px;
  margin: 0 auto;
  background: var(--zen-primary-color, AccentColor);
  opacity: 0.2;
}

/* ── Context Menu ──────────────────────────────────────────── */
#zen-sidebar-ctx-menu { appearance: auto; -moz-default-appearance: menupopup; }
`;
