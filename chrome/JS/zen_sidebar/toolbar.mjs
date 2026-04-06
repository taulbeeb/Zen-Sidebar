export class Toolbar {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.doc = sidebar.doc;
    this._icons = new Map();
  }

  // ── Build ─────────────────────────────────────────────────────────

  build() {
    this._toolbar = this._el("vbox", { id: "zen-sidebar-toolbar" });

    this._iconContainer = this._el("vbox", {
      id: "zen-sidebar-toolbar-icons",
      flex: "1",
    });

    const bottomBar = this._el("vbox", { id: "zen-sidebar-toolbar-bottom" });

    const addBtn = this._el("toolbarbutton", {
      id: "zen-sidebar-add-btn",
      tooltiptext: "Add web panel",
      label: "+",
    });
    addBtn.addEventListener("command", () => this._promptAddPanel());

    bottomBar.appendChild(addBtn);
    this._toolbar.append(this._iconContainer, bottomBar);
    return this._toolbar;
  }

  // ── Icon Management ───────────────────────────────────────────────

  addIcon(panel) {
    const tooltip = this._tooltip(panel);

    const btn = this._el("toolbarbutton", {
      class: "zen-sidebar-panel-icon",
      tooltiptext: tooltip,
      "data-panel-id": panel.id,
    });

    if (panel.icon) btn.setAttribute("image", panel.icon);
    this._applyContainerColor(btn, panel);

    btn.addEventListener("command", () => this.sidebar.switchToPanel(panel));
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

  rebuild() {
    this._iconContainer.textContent = "";
    this._icons.clear();
    for (const panel of this.sidebar.panelManager.panels) this.addIcon(panel);
    if (this.sidebar.panelManager.activePanel) this.setActive(this.sidebar.panelManager.activePanel);
  }

  // ── Add Panel ─────────────────────────────────────────────────────

  _promptAddPanel() {
    const url = { value: "https://" };
    const urlOk = Services.prompt.prompt(
      this.sidebar.win, "Add Web Panel",
      "Enter the URL for the web panel:", url, null, { value: false }
    );
    if (!urlOk || !url.value) return;

    let finalURL = url.value.trim();
    if (!/^https?:\/\//i.test(finalURL)) finalURL = "https://" + finalURL;

    const label = { value: "" };
    const labelOk = Services.prompt.prompt(
      this.sidebar.win, "Panel Label",
      "Enter a label (leave blank for auto-detect):", label, null, { value: false }
    );
    if (!labelOk) return;

    const userContextId = this._promptContainerSelect();
    if (userContextId === null) return;

    this.sidebar.panelManager.addPanel(finalURL, label.value || null, null, userContextId);
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

  // ── Context Menu (right-click on panel icon) ──────────────────────

  _showContextMenu(event, panel) {
    const existing = this.doc.getElementById("zen-sidebar-ctx-menu");
    if (existing) existing.remove();

    const popup = this._el("menupopup", { id: "zen-sidebar-ctx-menu" });

    // ── Panel info header (non-interactive) ──
    const headerItem = this._el("menuitem", {
      label: panel.label,
      disabled: "true",
      class: "menuitem-iconic",
    });
    if (panel.icon) headerItem.setAttribute("image", panel.icon);

    // ── Edit URL ──
    const editUrlItem = this._el("menuitem", { label: "Change URL..." });
    editUrlItem.addEventListener("command", () => {
      const url = { value: panel.url };
      const ok = Services.prompt.prompt(
        this.sidebar.win, "Edit URL", "URL:", url, null, { value: false }
      );
      if (ok && url.value) {
        this.sidebar.panelManager.editPanel(panel, url.value, panel.label, null, panel.userContextId);
      }
    });

    // ── Edit Label ──
    const editLabelItem = this._el("menuitem", { label: "Change Label..." });
    editLabelItem.addEventListener("command", () => {
      const label = { value: panel.label };
      const ok = Services.prompt.prompt(
        this.sidebar.win, "Edit Label", "Label:", label, null, { value: false }
      );
      if (ok && label.value) {
        this.sidebar.panelManager.editPanel(panel, panel.url, label.value, null, panel.userContextId);
      }
    });

    // ── Container submenu ──
    const containerName = this.sidebar.panelManager.getContainerName(panel.userContextId);
    const containerItem = this._el("menuitem", {
      label: `Container: ${containerName}`,
    });
    containerItem.addEventListener("command", () => {
      const newId = this._promptContainerSelect(panel.userContextId || 0);
      if (newId !== null && newId !== panel.userContextId) {
        this.sidebar.panelManager.editPanel(panel, panel.url, panel.label, panel.icon, newId);
      }
    });

    const sep1 = this._el("menuseparator");

    // ── Toggle navbar ──
    const toolbarItem = this._el("menuitem", {
      label: panel.showToolbar !== false ? "Hide Navigation Bar" : "Show Navigation Bar",
      type: "checkbox",
      checked: panel.showToolbar !== false ? "true" : "false",
    });
    toolbarItem.addEventListener("command", () => {
      panel.showToolbar = !panel.showToolbar;
      this.sidebar.panelManager.save();
      this.sidebar.updateNavBarVisibility();
    });

    // ── Reload ──
    const reloadItem = this._el("menuitem", { label: "Reload" });
    reloadItem.addEventListener("command", () => panel.reload());

    // ── Go Home ──
    const homeItem = this._el("menuitem", { label: "Go to Home URL" });
    homeItem.addEventListener("command", () => {
      if (panel._browser) panel._browser.setAttribute("src", panel.url);
    });

    const sep2 = this._el("menuseparator");

    // ── Move ──
    const moveUpItem = this._el("menuitem", { label: "Move Up" });
    moveUpItem.addEventListener("command", () => this.sidebar.panelManager.movePanel(panel, -1));

    const moveDownItem = this._el("menuitem", { label: "Move Down" });
    moveDownItem.addEventListener("command", () => this.sidebar.panelManager.movePanel(panel, 1));

    const sep3 = this._el("menuseparator");

    // ── Remove ──
    const removeItem = this._el("menuitem", { label: "Remove Panel" });
    removeItem.addEventListener("command", () => this.sidebar.panelManager.removePanel(panel));

    popup.append(
      headerItem, sep1,
      editUrlItem, editLabelItem, containerItem,
      sep2,
      toolbarItem, reloadItem, homeItem,
      sep3,
      moveUpItem, moveDownItem,
      this._el("menuseparator"),
      removeItem
    );

    // Find popup set
    const popupSet = this.doc.getElementById("mainPopupSet") || this.doc.documentElement;
    popupSet.appendChild(popup);
    popup.openPopup(event.target, "after_end", 0, 0, true, false);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  _tooltip(panel) {
    const name = this.sidebar.panelManager.getContainerName(panel.userContextId);
    return panel.userContextId > 0 ? `${panel.label} [${name}]` : panel.label;
  }

  _applyContainerColor(btn, panel) {
    if (panel.userContextId > 0) {
      const containers = this.sidebar.panelManager.getContainers();
      const match = containers.find((c) => c.userContextId === panel.userContextId);
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
