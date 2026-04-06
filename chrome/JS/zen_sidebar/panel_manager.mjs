import { WebPanel } from "./web_panel.mjs";

const PREF_PANELS = "zen.sidebar.panels";

export class PanelManager {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.panels = [];
    this._activePanel = null;
  }

  get activePanel() {
    return this._activePanel;
  }

  // ── Panel CRUD ────────────────────────────────────────────────────

  addPanel(url, label, icon, userContextId = 0) {
    const id = `zen-wp-${Date.now()}`;
    const panel = new WebPanel(this.sidebar, {
      id,
      url,
      label: label || this._labelFromURL(url),
      icon: icon || this._faviconURL(url),
      userContextId,
    });
    this.panels.push(panel);
    panel.createBrowser();
    this.sidebar.toolbar.addIcon(panel);
    this.switchTo(panel);
    this.save();
    return panel;
  }

  removePanel(panel) {
    const idx = this.panels.indexOf(panel);
    if (idx === -1) return;

    panel.destroy();
    this.panels.splice(idx, 1);
    this.sidebar.toolbar.removeIcon(panel);

    if (this._activePanel === panel) {
      this._activePanel = null;
      if (this.panels.length > 0) {
        this.switchTo(this.panels[Math.min(idx, this.panels.length - 1)]);
      } else {
        this.sidebar.hide();
      }
    }
    this.save();
  }

  editPanel(panel, url, label, icon, userContextId) {
    panel.url = url;
    panel.label = label || this._labelFromURL(url);
    panel.icon = icon || this._faviconURL(url);
    if (userContextId !== undefined) {
      const containerChanged = panel.userContextId !== userContextId;
      panel.userContextId = userContextId;
      if (containerChanged) {
        // Must recreate the browser element to change containers
        panel.destroy();
        panel.createBrowser();
      }
    }
    panel.reload();
    this.sidebar.toolbar.updateIcon(panel);
    this.save();
  }

  movePanel(panel, direction) {
    const idx = this.panels.indexOf(panel);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this.panels.length) return;

    this.panels.splice(idx, 1);
    this.panels.splice(newIdx, 0, panel);
    this.sidebar.toolbar.rebuild();
    this.save();
  }

  // ── Panel Switching ───────────────────────────────────────────────

  switchTo(panel) {
    if (this._activePanel && this._activePanel !== panel) {
      this._activePanel.hide();
    }
    this._activePanel = panel;
    panel.show();
    this.sidebar.toolbar.setActive(panel);
  }

  // ── Persistence ───────────────────────────────────────────────────

  save() {
    const data = this.panels.map((p) => ({
      id: p.id,
      url: p.url,
      label: p.label,
      icon: p.icon,
      userContextId: p.userContextId || 0,
      showToolbar: p.showToolbar !== false,
    }));
    const activeId = this._activePanel ? this._activePanel.id : null;
    const json = JSON.stringify({ panels: data, activeId });
    Services.prefs.setStringPref(PREF_PANELS, json);
  }

  restore() {
    let json;
    try {
      json = Services.prefs.getStringPref(PREF_PANELS, "");
    } catch {
      return;
    }
    if (!json) return;

    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }

    if (!data.panels || !Array.isArray(data.panels)) return;

    for (const pData of data.panels) {
      const panel = new WebPanel(this.sidebar, {
        id: pData.id,
        url: pData.url,
        label: pData.label,
        icon: pData.icon,
        userContextId: pData.userContextId || 0,
        showToolbar: pData.showToolbar !== false,
      });
      this.panels.push(panel);
      panel.createBrowser();
      this.sidebar.toolbar.addIcon(panel);
    }

    // Restore active panel
    if (data.activeId) {
      const active = this.panels.find((p) => p.id === data.activeId);
      if (active) {
        this._activePanel = active;
        this.sidebar.toolbar.setActive(active);
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────

  _labelFromURL(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  _faviconURL(url) {
    try {
      const u = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch {
      return "";
    }
  }

  /**
   * Returns available Firefox containers (Contextual Identities).
   * Each entry has: { userContextId, name, icon, color }
   * Returns empty array if containers are disabled.
   */
  getContainers() {
    try {
      const start = ChromeUtils.importESModule
        ? ChromeUtils.importESModule(
            "resource://gre/modules/ContextualIdentityService.sys.mjs"
          )
        : ChromeUtils.import(
            "resource://gre/modules/ContextualIdentityService.jsm"
          );
      const service =
        start.ContextualIdentityService || ContextualIdentityService;
      const identities = service.getPublicIdentities();
      return identities.map((ci) => ({
        userContextId: ci.userContextId,
        name: ContextualIdentityService.getUserContextLabel(ci.userContextId),
        icon: ci.icon,
        color: ci.color,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Look up the display name for a container by its userContextId.
   * Returns "No Container" for 0 or unknown IDs.
   */
  getContainerName(userContextId) {
    if (!userContextId) return "No Container";
    const containers = this.getContainers();
    const match = containers.find((c) => c.userContextId === userContextId);
    return match ? match.name : "No Container";
  }
}
