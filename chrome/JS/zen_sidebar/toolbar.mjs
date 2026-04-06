export class Toolbar {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.doc = sidebar.doc;
    this._icons = new Map();
  }

  build() {
    this._toolbar = this._el("vbox", { id: "zen-sidebar-toolbar" });
    this._iconContainer = this._el("vbox", { id: "zen-sidebar-toolbar-icons", flex: "1" });
    const bottomBar = this._el("vbox", { id: "zen-sidebar-toolbar-bottom" });

    const addBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-add-btn",
      tooltiptext: "Add web panel",
      label: "+",
    });
    addBtn.addEventListener("command", () => this.sidebar.showAddPanelForm());

    bottomBar.appendChild(addBtn);
    this._toolbar.append(this._iconContainer, bottomBar);
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

    // Click: switch or toggle
    btn.addEventListener("command", () => this.sidebar.switchToPanel(panel));

    // Right-click: context menu
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._showContextMenu(e, panel);
    });

    this._icons.set(panel.id, btn);
    this._iconContainer.appendChild(btn);
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

  rebuild() {
    this._iconContainer.textContent = "";
    this._icons.clear();
    for (const panel of this.sidebar.panelManager.panels) this.addIcon(panel);
    if (this.sidebar.panelManager.activePanel) this.setActive(this.sidebar.panelManager.activePanel);
  }

  // ── Context Menu ──────────────────────────────────────────────────

  _showContextMenu(event, panel) {
    const existing = this.doc.getElementById("zen-sidebar-ctx-menu");
    if (existing) existing.remove();

    const popup = this._el("menupopup", { id: "zen-sidebar-ctx-menu" });

    // Panel info
    const headerItem = this._el("menuitem", { label: panel.label, disabled: "true", class: "menuitem-iconic" });
    if (panel.icon) headerItem.setAttribute("image", panel.icon);

    // Edit (opens form)
    const editItem = this._el("menuitem", { label: "Edit Panel..." });
    editItem.addEventListener("command", () => this.sidebar.showAddPanelForm(panel));

    // Container
    const containerName = this.sidebar.panelManager.getContainerName(panel.userContextId);
    const containerItem = this._el("menuitem", { label: `Container: ${containerName}` });
    containerItem.addEventListener("command", () => {
      const newId = this._promptContainerSelect(panel.userContextId || 0);
      if (newId !== null && newId !== panel.userContextId) {
        this.sidebar.panelManager.editPanel(panel, panel.url, panel.label, panel.icon, newId);
      }
    });

    const sep1 = this._el("menuseparator");

    // Toggle nav bar
    const toolbarItem = this._el("menuitem", {
      label: panel.showToolbar !== false ? "Hide Navigation Bar" : "Show Navigation Bar",
    });
    toolbarItem.addEventListener("command", () => {
      panel.showToolbar = !panel.showToolbar;
      this.sidebar.panelManager.save();
      this.sidebar.updateNavBarVisibility();
    });

    // Reload
    const reloadItem = this._el("menuitem", { label: "Reload" });
    reloadItem.addEventListener("command", () => panel.reload());

    // Go home
    const homeItem = this._el("menuitem", { label: "Go to Home URL" });
    homeItem.addEventListener("command", () => {
      if (panel._browser) panel._browser.setAttribute("src", panel.url);
    });

    const sep2 = this._el("menuseparator");

    // Move
    const moveUpItem = this._el("menuitem", { label: "Move Up" });
    moveUpItem.addEventListener("command", () => this.sidebar.panelManager.movePanel(panel, -1));
    const moveDownItem = this._el("menuitem", { label: "Move Down" });
    moveDownItem.addEventListener("command", () => this.sidebar.panelManager.movePanel(panel, 1));

    const sep3 = this._el("menuseparator");

    // Remove
    const removeItem = this._el("menuitem", { label: "Remove Panel" });
    removeItem.addEventListener("command", () => this.sidebar.panelManager.removePanel(panel));

    popup.append(
      headerItem, sep1,
      editItem, containerItem,
      sep2,
      toolbarItem, reloadItem, homeItem,
      sep3,
      moveUpItem, moveDownItem,
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
    const name = this.sidebar.panelManager.getContainerName(panel.userContextId);
    return panel.userContextId > 0 ? `${panel.label} [${name}]` : panel.label;
  }

  _applyContainerColor(btn, panel) {
    if (panel.userContextId > 0) {
      const match = this.sidebar.panelManager.getContainers().find((c) => c.userContextId === panel.userContextId);
      if (match?.color) btn.setAttribute("data-container-color", match.color);
    } else {
      btn.removeAttribute("data-container-color");
    }
  }

  _el(tag, attrs = {}) {
    const el = this.doc.createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
}
