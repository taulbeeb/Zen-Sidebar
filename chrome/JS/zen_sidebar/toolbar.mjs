export class Toolbar {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.doc = sidebar.doc;
    this._icons = new Map();
  }

  // ── Build ─────────────────────────────────────────────────────────

  build() {
    this._toolbar = this._el("vbox", {
      id: "zen-sidebar-toolbar",
    });

    // Panel icons container (scrollable)
    this._iconContainer = this._el("vbox", {
      id: "zen-sidebar-toolbar-icons",
      flex: "1",
    });

    // Bottom buttons
    const bottomBar = this._el("vbox", {
      id: "zen-sidebar-toolbar-bottom",
    });

    // Add panel button
    const addBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-add-btn",
      tooltiptext: "Add web panel",
      class: "zen-sidebar-toolbar-btn",
      label: "+",
    });
    addBtn.addEventListener("command", () => this._promptAddPanel());

    bottomBar.appendChild(addBtn);
    this._toolbar.append(this._iconContainer, bottomBar);

    return this._toolbar;
  }

  // ── Icon Management ───────────────────────────────────────────────

  addIcon(panel) {
    const btn = this._el("toolbarbutton", {
      class: "zen-sidebar-panel-icon",
      tooltiptext: panel.label,
      "data-panel-id": panel.id,
    });

    // Set favicon as icon
    if (panel.icon) {
      btn.setAttribute("image", panel.icon);
    }

    btn.addEventListener("command", () => {
      this.sidebar.switchToPanel(panel);
    });

    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._showContextMenu(e, panel);
    });

    this._icons.set(panel.id, btn);
    this._iconContainer.appendChild(btn);
  }

  removeIcon(panel) {
    const btn = this._icons.get(panel.id);
    if (btn) {
      btn.remove();
      this._icons.delete(panel.id);
    }
  }

  updateIcon(panel) {
    const btn = this._icons.get(panel.id);
    if (btn) {
      btn.setAttribute("tooltiptext", panel.label);
      if (panel.icon) {
        btn.setAttribute("image", panel.icon);
      }
    }
  }

  setActive(panel) {
    // Remove active from all
    for (const btn of this._icons.values()) {
      btn.removeAttribute("data-active");
    }
    // Set active on current
    const btn = this._icons.get(panel.id);
    if (btn) {
      btn.setAttribute("data-active", "true");
    }
  }

  rebuild() {
    // Clear and re-add icons in panel order
    this._iconContainer.textContent = "";
    this._icons.clear();
    for (const panel of this.sidebar.panelManager.panels) {
      this.addIcon(panel);
    }
    if (this.sidebar.panelManager.activePanel) {
      this.setActive(this.sidebar.panelManager.activePanel);
    }
  }

  // ── Add Panel Prompt ──────────────────────────────────────────────

  _promptAddPanel() {
    const url = { value: "https://" };
    const label = { value: "" };

    const urlOk = Services.prompt.prompt(
      this.sidebar.win,
      "Add Web Panel",
      "Enter the URL for the web panel:",
      url,
      null,
      { value: false }
    );
    if (!urlOk || !url.value) return;

    // Ensure URL has protocol
    let finalURL = url.value.trim();
    if (!/^https?:\/\//i.test(finalURL)) {
      finalURL = "https://" + finalURL;
    }

    const labelOk = Services.prompt.prompt(
      this.sidebar.win,
      "Panel Label",
      "Enter a label (leave blank for auto-detect):",
      label,
      null,
      { value: false }
    );
    if (!labelOk) return;

    this.sidebar.panelManager.addPanel(finalURL, label.value || null, null);
  }

  // ── Context Menu ──────────────────────────────────────────────────

  _showContextMenu(event, panel) {
    // Remove existing context menu if any
    const existing = this.doc.getElementById("zen-sidebar-ctx-menu");
    if (existing) existing.remove();

    const popup = this._el("menupopup", {
      id: "zen-sidebar-ctx-menu",
    });

    const editItem = this._el("menuitem", {
      label: "Edit panel...",
    });
    editItem.addEventListener("command", () => this._promptEditPanel(panel));

    const reloadItem = this._el("menuitem", {
      label: "Reload panel",
    });
    reloadItem.addEventListener("command", () => panel.reload());

    const moveUpItem = this._el("menuitem", {
      label: "Move up",
    });
    moveUpItem.addEventListener("command", () =>
      this.sidebar.panelManager.movePanel(panel, -1)
    );

    const moveDownItem = this._el("menuitem", {
      label: "Move down",
    });
    moveDownItem.addEventListener("command", () =>
      this.sidebar.panelManager.movePanel(panel, 1)
    );

    const sep = this._el("menuseparator", {});

    const removeItem = this._el("menuitem", {
      label: "Remove panel",
    });
    removeItem.addEventListener("command", () =>
      this.sidebar.panelManager.removePanel(panel)
    );

    popup.append(editItem, reloadItem, moveUpItem, moveDownItem, sep, removeItem);
    this.doc.getElementById("mainPopupSet").appendChild(popup);

    popup.openPopup(event.target, "after_end", 0, 0, true, false);
  }

  _promptEditPanel(panel) {
    const url = { value: panel.url };
    const label = { value: panel.label };

    const urlOk = Services.prompt.prompt(
      this.sidebar.win,
      "Edit Web Panel",
      "URL:",
      url,
      null,
      { value: false }
    );
    if (!urlOk) return;

    const labelOk = Services.prompt.prompt(
      this.sidebar.win,
      "Edit Web Panel",
      "Label:",
      label,
      null,
      { value: false }
    );
    if (!labelOk) return;

    this.sidebar.panelManager.editPanel(panel, url.value, label.value, null);
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
