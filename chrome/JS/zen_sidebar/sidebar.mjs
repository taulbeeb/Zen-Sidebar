import { PanelManager } from "./panel_manager.mjs";
import { Toolbar } from "./toolbar.mjs";

const PREF_MODE = "zen.sidebar.mode";
const PREF_WIDTH = "zen.sidebar.width";
const SIDEBAR_DEFAULT_WIDTH = 400;

export class ZenSidebar {
  constructor(win) {
    this.win = win;
    this.doc = win.document;
    this.panelManager = new PanelManager(this);
    this.toolbar = new Toolbar(this);
    this._panelOpen = false; // is a panel content area visible?
    this._mode = "overlay";
  }

  init() {
    console.log("[ZenSidebar] Initializing...");
    this._loadPrefs();
    this._buildDOM();
    this._injectInlineCSS();
    this._registerKeybinding();
    this._restorePanels();
    // Toolbar is always visible after init
    this._sidebarBox.removeAttribute("hidden");
    console.log("[ZenSidebar] Ready.");
  }

  destroy() {
    this._removeKeybinding();
    this._savePrefs();
    for (const el of [this._sidebarBox, this._splitter, this._inlineStyleEl]) {
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

    // Outer wrapper - always visible (holds toolbar strip + panel area)
    this._sidebarBox = this._el("vbox", {
      id: "zen-sidebar-box",
      hidden: "true",
    });

    // Splitter (only shown when panel content is open)
    this._splitter = this._el("splitter", {
      id: "zen-sidebar-splitter",
      hidden: "true",
    });
    this._splitter.addEventListener("mousedown", () => this._onSplitterDrag());

    // ── Panel area (nav + content) - collapsible ──
    this._panelArea = this._el("vbox", {
      id: "zen-sidebar-panel-area",
      hidden: "true",
    });

    // Nav bar
    this._navBar = this._el("hbox", {
      id: "zen-sidebar-navbar",
      align: "center",
    });

    const backBtn = this._navBtn("zen-sb-back", "Back", "chrome://global/skin/icons/arrow-left.svg", () => this._navAction("back"));
    const fwdBtn = this._navBtn("zen-sb-forward", "Forward", "chrome://global/skin/icons/arrow-right.svg", () => this._navAction("forward"));
    const reloadBtn = this._navBtn("zen-sb-reload", "Reload", "chrome://global/skin/icons/reload.svg", () => this._navAction("reload"));
    const homeBtn = this._navBtn("zen-sb-home", "Go to panel URL", "chrome://global/skin/icons/home.svg", () => this._navAction("home"));
    const spacer = this._el("spacer", { flex: "1" });
    const modeBtn = this._navBtn("zen-sb-mode", "Toggle overlay/resize", null, () => this.toggleMode());
    modeBtn.setAttribute("data-mode", this._mode);
    const closeBtn = this._navBtn("zen-sb-close", "Close panel", "chrome://global/skin/icons/close.svg", () => this.collapsePanel());
    closeBtn.classList.add("zen-sb-close-btn");

    this._navBar.append(backBtn, fwdBtn, reloadBtn, homeBtn, spacer, modeBtn, closeBtn);

    // Panel content container (browser elements go here)
    this._panelContainer = this._el("vbox", {
      id: "zen-sidebar-panel-container",
      flex: "1",
    });

    this._panelArea.append(this._navBar, this._panelContainer);

    // Vertical icon toolbar (always visible)
    const toolbarEl = this.toolbar.build();

    // Layout: [splitter] [panel-area | toolbar-strip]
    this._sidebarBox.append(this._panelArea, toolbarEl);
    this._sidebarBox.style.width = "";  // width set dynamically
    container.append(this._splitter, this._sidebarBox);
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

  // ── Panel Expand / Collapse (click icon to toggle) ────────────────

  get panelOpen() {
    return this._panelOpen;
  }

  expandPanel(panel) {
    this._panelOpen = true;
    this._panelArea.removeAttribute("hidden");
    this._splitter.removeAttribute("hidden");

    // Set width from panel or global default
    const width = panel?.width || this._getWidth();
    this._sidebarBox.style.width = `${width + 42}px`; // +42 for toolbar strip
    this._panelArea.style.width = `${width}px`;

    this._applyMode();
    this.updateNavBarVisibility();

    if (panel) panel.load();
  }

  collapsePanel() {
    this._panelOpen = false;
    this._panelArea.setAttribute("hidden", "true");
    this._splitter.setAttribute("hidden", "true");
    this._sidebarBox.style.width = "";  // collapse to toolbar width only
    this._clearResize();

    // Deselect active icon
    this.toolbar.clearActive();
  }

  // ── Switch or toggle a panel ──────────────────────────────────────

  switchToPanel(panel) {
    const active = this.panelManager.activePanel;

    // If clicking the already-active panel, toggle it
    if (active === panel && this._panelOpen) {
      this.collapsePanel();
      return;
    }

    this.panelManager.switchTo(panel);
    this.expandPanel(panel);
  }

  // ── Show "Add Panel" form inside the panel area ───────────────────

  showAddPanelForm(editPanel = null) {
    // Clear panel container and show a form
    this._panelArea.removeAttribute("hidden");
    this._splitter.removeAttribute("hidden");
    this._navBar.setAttribute("collapsed", "true");
    this._sidebarBox.style.width = `${this._getWidth() + 42}px`;
    this._panelArea.style.width = `${this._getWidth()}px`;

    // Hide all browsers
    for (const p of this.panelManager.panels) p.hide();

    // Create HTML form
    const existing = this.doc.getElementById("zen-sb-add-form");
    if (existing) existing.remove();

    const frame = this.doc.createXULElement("browser");
    frame.setAttribute("id", "zen-sb-add-form");
    frame.setAttribute("type", "content");
    frame.setAttribute("disableglobalhistory", "true");
    frame.setAttribute("flex", "1");
    frame.style.border = "none";

    this._panelContainer.appendChild(frame);

    const isEdit = !!editPanel;
    const containers = this.panelManager.getContainers();
    const containerOptions = containers.map(
      (c) => `<option value="${c.userContextId}" ${editPanel && editPanel.userContextId === c.userContextId ? "selected" : ""}>${this._escHtml(c.name)}</option>`
    ).join("");

    const html = `<!DOCTYPE html>
<html>
<head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #2b2a33; color: #fbfbfe;
    padding: 24px 20px;
  }
  h2 { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
  hr { border: none; border-top: 1px solid rgba(128,128,128,0.2); margin: 16px 0; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #ccc; }
  input, select {
    width: 100%; padding: 10px 12px; font-size: 14px;
    background: rgba(255,255,255,0.07); color: #fbfbfe;
    border: 1px solid rgba(128,128,128,0.25); border-radius: 8px;
    outline: none; margin-bottom: 16px;
  }
  input:focus, select:focus { border-color: #7b68ee; }
  select option { background: #2b2a33; color: #fbfbfe; }
  .checkbox-row {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 16px; cursor: pointer;
  }
  .checkbox-row input[type="checkbox"] {
    width: 18px; height: 18px; margin: 0; cursor: pointer;
    accent-color: #7b68ee;
  }
  .checkbox-row span { font-size: 14px; }
  .btn-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
  button {
    padding: 8px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
    cursor: pointer; border: none;
  }
  .btn-primary { background: #7b68ee; color: white; }
  .btn-primary:hover { background: #6a56e0; }
  .btn-cancel { background: rgba(255,255,255,0.1); color: #ccc; }
  .btn-cancel:hover { background: rgba(255,255,255,0.15); }
</style></head>
<body>
  <h2>${isEdit ? "Edit Panel" : "Add Panel"}</h2>
  <hr>
  <label>Web Page URL</label>
  <input type="url" id="url" placeholder="https://example.com" value="${isEdit ? this._escHtml(editPanel.url) : "https://"}">
  <label>Panel Width</label>
  <input type="number" id="width" min="200" max="800" value="${isEdit ? (editPanel.width || this._getWidth()) : this._getWidth()}">
  <label>Container</label>
  <select id="container">
    <option value="0" ${!isEdit || !editPanel.userContextId ? "selected" : ""}>No Container</option>
    ${containerOptions}
  </select>
  <label class="checkbox-row">
    <input type="checkbox" id="mobile" ${(!isEdit || editPanel.mobileUA !== false) ? "checked" : ""}>
    <span>Use Mobile User Agent</span>
  </label>
  <hr>
  <div class="btn-row">
    <button class="btn-primary" id="submit">${isEdit ? "Save" : "Add"}</button>
    <button class="btn-cancel" id="cancel">Cancel</button>
  </div>
  <script>
    document.getElementById("submit").addEventListener("click", () => {
      const data = {
        url: document.getElementById("url").value,
        width: parseInt(document.getElementById("width").value) || 400,
        userContextId: parseInt(document.getElementById("container").value) || 0,
        mobileUA: document.getElementById("mobile").checked,
      };
      // Communicate back to chrome via a custom event on the title
      document.title = "ZEN_SIDEBAR_SUBMIT:" + JSON.stringify(data);
    });
    document.getElementById("cancel").addEventListener("click", () => {
      document.title = "ZEN_SIDEBAR_CANCEL";
    });
  </script>
</body>
</html>`;

    // Load the form HTML
    const dataURL = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    frame.setAttribute("src", dataURL);

    // Watch for title changes as IPC mechanism
    const observer = new this.win.MutationObserver(() => {
      const title = frame.contentTitle || "";
      if (title.startsWith("ZEN_SIDEBAR_SUBMIT:")) {
        const json = title.substring("ZEN_SIDEBAR_SUBMIT:".length);
        try {
          const data = JSON.parse(json);
          this._handleFormSubmit(data, editPanel);
        } catch (e) {
          console.error("[ZenSidebar] Form parse error", e);
        }
        cleanup();
      } else if (title === "ZEN_SIDEBAR_CANCEL") {
        cleanup();
      }
    });

    const cleanup = () => {
      observer.disconnect();
      frame.remove();
      // Restore panel view
      if (this.panelManager.activePanel && this._panelOpen) {
        this.panelManager.activePanel.show();
        this.updateNavBarVisibility();
      } else {
        this.collapsePanel();
      }
    };

    // Observe the browser's content title attribute
    const startObserving = () => {
      observer.observe(frame, { attributes: true, attributeFilter: ["contenttitle"] });
    };
    // Also try to observe after a delay for content load
    frame.addEventListener("load", startObserving, { once: true });
    this.win.setTimeout(startObserving, 500);
  }

  _handleFormSubmit(data, editPanel) {
    let url = (data.url || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    if (editPanel) {
      editPanel.width = data.width || this._getWidth();
      editPanel.mobileUA = data.mobileUA !== false;
      this.panelManager.editPanel(editPanel, url, null, null, data.userContextId);
    } else {
      this.panelManager.addPanel(url, null, null, data.userContextId || 0, {
        width: data.width || this._getWidth(),
        mobileUA: data.mobileUA !== false,
      });
    }
  }

  _escHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    const w = parseInt(this._sidebarBox.style.width, 10) || this._getWidth() + 42;
    if (appcontent) appcontent.style.marginRight = `${w}px`;
  }

  _clearResize() {
    const appcontent = this.doc.getElementById("appcontent");
    if (appcontent) appcontent.style.marginRight = "";
  }

  // ── Splitter / Resize ─────────────────────────────────────────────

  _onSplitterDrag() {
    const onMouseMove = (e) => {
      const rect = this._container.getBoundingClientRect();
      const totalW = Math.max(242, Math.min(842, rect.right - e.clientX));
      this._sidebarBox.style.width = `${totalW}px`;
      this._panelArea.style.width = `${totalW - 42}px`;
      if (this._mode === "resize") this._pushContent();
    };
    const onMouseUp = () => {
      this.doc.removeEventListener("mousemove", onMouseMove);
      this.doc.removeEventListener("mouseup", onMouseUp);
      const panelW = parseInt(this._panelArea.style.width, 10);
      if (panelW) Services.prefs.setIntPref(PREF_WIDTH, panelW);
    };
    this.doc.addEventListener("mousemove", onMouseMove);
    this.doc.addEventListener("mouseup", onMouseUp);
  }

  // ── Keyboard Shortcut ─────────────────────────────────────────────

  _registerKeybinding() {
    this._keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        // Toggle: if panel open, collapse. If collapsed, expand last active.
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

  // ── Inline CSS ────────────────────────────────────────────────────

  _injectInlineCSS() {
    const style = this.doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.textContent = CSS_TEXT;
    this.doc.documentElement.appendChild(style);
    this._inlineStyleEl = style;
  }
}

const CSS_TEXT = `
/* ── Sidebar Outer Box (always visible) ────────────────────── */
#zen-sidebar-box {
  display: flex; flex-direction: row;
  background: var(--toolbar-bgcolor, #1c1b22);
  border-left: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.15));
  font-family: system-ui, -apple-system, sans-serif;
}
#zen-sidebar-box[hidden="true"] { display: none !important; }

/* When panel is closed, just show the toolbar strip */
#zen-sidebar-box:not(:has(#zen-sidebar-panel-area:not([hidden]))) {
  border-left: none;
}

/* Overlay vs resize only applies when panel content is open */
#zen-sidebar-box[data-mode="overlay"]:has(#zen-sidebar-panel-area:not([hidden])) {
  position: fixed; right: 0; top: 0; bottom: 0; z-index: 10000;
  box-shadow: -2px 0 12px rgba(0,0,0,0.25);
}
#zen-sidebar-box[data-mode="resize"]:has(#zen-sidebar-panel-area:not([hidden])) {
  position: relative; z-index: 1;
}

/* ── Splitter ──────────────────────────────────────────────── */
#zen-sidebar-splitter {
  width: 3px; min-width: 3px; border: none; cursor: ew-resize;
  background: transparent; z-index: 10001;
}
#zen-sidebar-splitter:hover {
  background: var(--zen-primary-color, color-mix(in srgb, AccentColor 80%, transparent));
}
#zen-sidebar-splitter[hidden="true"] { display: none; }

/* ── Panel Area (collapsible: nav + content) ───────────────── */
#zen-sidebar-panel-area {
  display: flex; flex-direction: column;
  flex: 1; min-width: 200px;
  overflow: hidden;
}
#zen-sidebar-panel-area[hidden="true"] { display: none !important; }

/* ── Nav Bar ───────────────────────────────────────────────── */
#zen-sidebar-navbar {
  display: flex; align-items: center; gap: 1px;
  padding: 4px 6px;
  background: var(--toolbar-bgcolor, #1c1b22);
  border-bottom: 1px solid var(--chrome-content-separator-color, rgba(128,128,128,0.12));
  min-height: 32px; flex-shrink: 0;
}
#zen-sidebar-navbar[collapsed="true"] { display: none; }

.zen-sb-nav-btn {
  appearance: none; width: 28px; height: 28px;
  border-radius: 6px; background: transparent; border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 0; opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}
.zen-sb-nav-btn .toolbarbutton-icon {
  width: 14px; height: 14px;
  -moz-context-properties: fill;
  fill: var(--toolbar-color, #fbfbfe);
}
.zen-sb-nav-btn:hover {
  background: var(--toolbarbutton-hover-background, rgba(255,255,255,0.08)); opacity: 1;
}
.zen-sb-close-btn:hover { background: rgba(255,70,70,0.25) !important; opacity: 1; }

/* Mode toggle icon */
#zen-sb-mode .toolbarbutton-icon { display: none; }
#zen-sb-mode::after {
  content: ""; width: 14px; height: 14px;
  background: var(--toolbar-color, #fbfbfe);
  mask-size: contain; mask-repeat: no-repeat; mask-position: center; opacity: 0.7;
}
#zen-sb-mode[data-mode="overlay"]::after { mask-image: url("chrome://global/skin/icons/open-in-new.svg"); }
#zen-sb-mode[data-mode="resize"]::after { mask-image: url("chrome://global/skin/icons/arrow-left.svg"); }

/* ── Panel Container ───────────────────────────────────────── */
#zen-sidebar-panel-container {
  display: flex; flex-direction: column; flex: 1; overflow: hidden;
}
.zen-sidebar-web-panel-browser {
  flex: 1; border: none; background: var(--toolbar-bgcolor, #1c1b22);
}

/* ── Icon Toolbar (always visible vertical strip) ──────────── */
#zen-sidebar-toolbar {
  display: flex; flex-direction: column;
  width: 42px; min-width: 42px; flex-shrink: 0;
  background: var(--toolbar-bgcolor, #1c1b22);
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
  appearance: none; width: 32px; height: 32px;
  border-radius: 8px; background: transparent;
  border: 2px solid transparent; cursor: pointer;
  padding: 3px; position: relative;
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

/* ── Context Menu ──────────────────────────────────────────── */
#zen-sidebar-ctx-menu { appearance: auto; -moz-default-appearance: menupopup; }
`;
