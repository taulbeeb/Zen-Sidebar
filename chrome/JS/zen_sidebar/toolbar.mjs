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
    const containerName = this.sidebar.panelManager.getContainerName(
      panel.userContextId
    );
    const tooltip =
      panel.userContextId > 0
        ? `${panel.label} [${containerName}]`
        : panel.label;

    const btn = this._el("toolbarbutton", {
      class: "zen-sidebar-panel-icon",
      tooltiptext: tooltip,
      "data-panel-id": panel.id,
    });

    // Set favicon as icon
    if (panel.icon) {
      btn.setAttribute("image", panel.icon);
    }

    // Container color indicator
    this._applyContainerColor(btn, panel);

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
      const containerName = this.sidebar.panelManager.getContainerName(
        panel.userContextId
      );
      const tooltip =
        panel.userContextId > 0
          ? `${panel.label} [${containerName}]`
          : panel.label;
      btn.setAttribute("tooltiptext", tooltip);
      if (panel.icon) {
        btn.setAttribute("image", panel.icon);
      }
      this._applyContainerColor(btn, panel);
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

    // Container selection
    const userContextId = this._promptContainerSelect();
    if (userContextId === null) return; // user cancelled

    this.sidebar.panelManager.addPanel(
      finalURL,
      label.value || null,
      null,
      userContextId
    );
  }

  /**
   * Shows a container picker dialog. Returns the selected userContextId
   * (0 for no container), or null if the user cancelled.
   */
  _promptContainerSelect(currentId = 0) {
    const containers = this.sidebar.panelManager.getContainers();
    if (containers.length === 0) {
      // Containers are disabled or unavailable, skip
      return 0;
    }

    const names = ["No Container", ...containers.map((c) => c.name)];
    const ids = [0, ...containers.map((c) => c.userContextId)];

    const selected = { value: ids.indexOf(currentId) };
    if (selected.value < 0) selected.value = 0;

    const ok = Services.prompt.select(
      this.sidebar.win,
      "Select Container",
      "Open this panel in a Firefox container:",
      names,
      selected
    );
    if (!ok) return null;

    return ids[selected.value];
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

    const containerItem = this._el("menuitem", {
      label:
        panel.userContextId > 0
          ? `Container: ${this.sidebar.panelManager.getContainerName(panel.userContextId)}`
          : "Assign container...",
    });
    containerItem.addEventListener("command", () => {
      const newId = this._promptContainerSelect(panel.userContextId || 0);
      if (newId !== null && newId !== panel.userContextId) {
        this.sidebar.panelManager.editPanel(
          panel,
          panel.url,
          panel.label,
          panel.icon,
          newId
        );
      }
    });

    const sep = this._el("menuseparator", {});

    const removeItem = this._el("menuitem", {
      label: "Remove panel",
    });
    removeItem.addEventListener("command", () =>
      this.sidebar.panelManager.removePanel(panel)
    );

    popup.append(
      editItem,
      reloadItem,
      containerItem,
      moveUpItem,
      moveDownItem,
      sep,
      removeItem
    );
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

    const userContextId = this._promptContainerSelect(
      panel.userContextId || 0
    );
    if (userContextId === null) return;

    this.sidebar.panelManager.editPanel(
      panel,
      url.value,
      label.value,
      null,
      userContextId
    );
  }

  // ── Container Color ────────────────────────────────────────────────

  _applyContainerColor(btn, panel) {
    if (panel.userContextId > 0) {
      const containers = this.sidebar.panelManager.getContainers();
      const match = containers.find(
        (c) => c.userContextId === panel.userContextId
      );
      if (match && match.color) {
        btn.setAttribute("data-container-color", match.color);
      }
    } else {
      btn.removeAttribute("data-container-color");
    }
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
