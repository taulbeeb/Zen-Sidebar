export class WebPanel {
  constructor(sidebar, { id, url, label, icon }) {
    this.sidebar = sidebar;
    this.id = id;
    this.url = url;
    this.label = label;
    this.icon = icon;
    this._browser = null;
    this._loaded = false;
  }

  // ── Browser Element ───────────────────────────────────────────────

  createBrowser() {
    const doc = this.sidebar.doc;
    const container = this.sidebar._panelContainer;

    this._browser = doc.createXULElement("browser");
    this._browser.setAttribute("id", this.id);
    this._browser.setAttribute("type", "content");
    this._browser.setAttribute("remote", "true");
    this._browser.setAttribute("disableglobalhistory", "true");
    this._browser.setAttribute("messagemanagergroup", "webext-browsers");
    this._browser.setAttribute("webextension-view-type", "sidebar");
    this._browser.setAttribute("class", "zen-sidebar-web-panel-browser");
    this._browser.setAttribute("flex", "1");
    this._browser.setAttribute("context", "contentAreaContextMenu");
    this._browser.setAttribute("tooltip", "aHTMLTooltip");
    this._browser.setAttribute("autocompletepopup", "PopupAutoComplete");
    this._browser.style.display = "none";

    // Set user agent to mobile for narrow sidebar panels
    this._browser.setAttribute(
      "useragent",
      "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    );

    container.appendChild(this._browser);
  }

  // ── Loading ───────────────────────────────────────────────────────

  load() {
    if (!this._browser) return;
    if (!this._loaded) {
      this._browser.setAttribute("src", this.url);
      this._loaded = true;
    }
  }

  reload() {
    if (!this._browser) return;
    this._browser.setAttribute("src", this.url);
    this._loaded = true;
  }

  // ── Visibility ────────────────────────────────────────────────────

  show() {
    if (!this._browser) return;
    this.load();
    this._browser.style.display = "";
  }

  hide() {
    if (!this._browser) return;
    this._browser.style.display = "none";
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  destroy() {
    if (this._browser) {
      this._browser.remove();
      this._browser = null;
    }
  }
}
