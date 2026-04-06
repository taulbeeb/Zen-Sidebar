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

  addPanel(url, label, icon) {
    const id = `zen-wp-${Date.now()}`;
    const panel = new WebPanel(this.sidebar, {
      id,
      url,
      label: label || this._labelFromURL(url),
      icon: icon || this._faviconURL(url),
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

  editPanel(panel, url, label, icon) {
    panel.url = url;
    panel.label = label || this._labelFromURL(url);
    panel.icon = icon || this._faviconURL(url);
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
}
