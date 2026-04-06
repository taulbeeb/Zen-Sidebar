import { WebPanel } from "./web_panel.mjs";

const PREF_PANELS = "zen.sidebar.panels";

export class PanelManager {
  constructor(sidebar) {
    this.sidebar = sidebar;
    this.panels = [];
    this._activePanel = null;
  }

  get activePanel() { return this._activePanel; }

  // ── Panel CRUD ────────────────────────────────────────────────────

  addPanel(url, label, icon, userContextId = 0, opts = {}) {
    const id = `zen-wp-${Date.now()}`;
    const panel = new WebPanel(this.sidebar, {
      id, url,
      label: label || this._labelFromURL(url),
      icon: icon || this._faviconURL(url),
      userContextId,
      width: opts.width || 0,
      mobileUA: opts.mobileUA !== false,
    });
    this.panels.push(panel);
    panel.createBrowser();
    this.sidebar.toolbar.addIcon(panel);
    this.sidebar.switchToPanel(panel);
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
        this.sidebar.switchToPanel(this.panels[Math.min(idx, this.panels.length - 1)]);
      } else {
        this.sidebar.collapsePanel();
      }
    }
    this.save();
  }

  editPanel(panel, url, label, icon, userContextId) {
    if (url) panel.url = url;
    if (label) panel.label = label;
    if (icon) panel.icon = icon;
    if (userContextId !== undefined) {
      const changed = panel.userContextId !== userContextId;
      panel.userContextId = userContextId;
      if (changed) {
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
      id: p.id, url: p.url, label: p.label, icon: p.icon,
      userContextId: p.userContextId || 0,
      showToolbar: p.showToolbar !== false,
      width: p.width || 0,
      mobileUA: p.mobileUA !== false,
    }));
    const activeId = this._activePanel ? this._activePanel.id : null;
    Services.prefs.setStringPref(PREF_PANELS, JSON.stringify({ panels: data, activeId }));
  }

  restore() {
    let json;
    try { json = Services.prefs.getStringPref(PREF_PANELS, ""); } catch { return; }
    if (!json) return;
    let data;
    try { data = JSON.parse(json); } catch { return; }
    if (!data.panels || !Array.isArray(data.panels)) return;

    for (const p of data.panels) {
      const panel = new WebPanel(this.sidebar, {
        id: p.id, url: p.url, label: p.label, icon: p.icon,
        userContextId: p.userContextId || 0,
        showToolbar: p.showToolbar !== false,
        width: p.width || 0,
        mobileUA: p.mobileUA !== false,
      });
      this.panels.push(panel);
      panel.createBrowser();
      this.sidebar.toolbar.addIcon(panel);
    }

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
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return url; }
  }

  _faviconURL(url) {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
    catch { return ""; }
  }

  getContainers() {
    try {
      const mod = ChromeUtils.importESModule
        ? ChromeUtils.importESModule("resource://gre/modules/ContextualIdentityService.sys.mjs")
        : ChromeUtils.import("resource://gre/modules/ContextualIdentityService.jsm");
      const svc = mod.ContextualIdentityService || ContextualIdentityService;
      return svc.getPublicIdentities().map((ci) => ({
        userContextId: ci.userContextId,
        name: ContextualIdentityService.getUserContextLabel(ci.userContextId),
        icon: ci.icon, color: ci.color,
      }));
    } catch { return []; }
  }

  getContainerName(userContextId) {
    if (!userContextId) return "No Container";
    const match = this.getContainers().find((c) => c.userContextId === userContextId);
    return match ? match.name : "No Container";
  }
}
