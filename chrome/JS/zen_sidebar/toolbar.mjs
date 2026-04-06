export class Toolbar {
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

  rebuild() {
    // Remove all panel icons but keep the + button
    for (const btn of this._icons.values()) btn.remove();
    this._icons.clear();
    for (const panel of this.sidebar.panelManager.panels) this.addIcon(panel);
    if (this.sidebar.panelManager.activePanel) this.setActive(this.sidebar.panelManager.activePanel);
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
    editItem.addEventListener("command", () => this.sidebar.showAddPanelForm(panel));

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

    const sep2 = this._el("menuseparator");

    const removeItem = this._el("menuitem", { label: "Remove Panel" });
    removeItem.addEventListener("command", () => this.sidebar.panelManager.removePanel(panel));

    popup.append(
      headerItem, sep1,
      editItem, containerItem,
      sep2,
      toolbarItem, reloadItem, homeItem,
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
