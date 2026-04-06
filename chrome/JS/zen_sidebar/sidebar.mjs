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
    this._loadPrefs();
    this._buildDOM();
    this._loadCSS();
    this._registerKeybinding();
    this._restorePanels();
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
  }

  // ── DOM Construction ──────────────────────────────────────────────

  _buildDOM() {
    const browser = this.doc.getElementById("browser");
    if (!browser) return;

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

    // Insert at the right end of the browser area
    browser.append(this._splitter, this._sidebarBox);

    // Update mode class
    this._applyMode();
  }

  _loadCSS() {
    const cssURL = "chrome://userchrome/content/JS/zen_sidebar/sidebar.css";
    const pi = this.doc.createProcessingInstruction(
      "xml-stylesheet",
      `href="${cssURL}" type="text/css"`
    );
    this.doc.insertBefore(pi, this.doc.documentElement);
    this._styleEl = pi;
  }

  // ── Visibility ────────────────────────────────────────────────────

  get visible() {
    return this._visible;
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  show() {
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
      const browserRect = this.doc
        .getElementById("browser")
        .getBoundingClientRect();
      const newWidth = Math.max(200, Math.min(800, browserRect.right - e.clientX));
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
    const keyset =
      this.doc.getElementById("mainKeyset") ||
      this.doc.getElementById("zenKeyset");

    if (keyset) {
      this._key = this._el("key", {
        id: "zen-sidebar-toggle-key",
        modifiers: "accel,shift",
        key: "E",
        oncommand: "void(0);",
      });
      this._key.addEventListener("command", () => this.toggle());
      keyset.appendChild(this._key);
    }

    // Fallback: listen for keydown
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
    if (this._key) {
      this._key.remove();
    }
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
