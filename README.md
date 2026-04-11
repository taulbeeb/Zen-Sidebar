# Zen Sidebar

A Vivaldi/Edge-style web panel sidebar for [Zen Browser](https://zen-browser.app/), implemented as a `chrome/` folder customization using userChrome.js (fx-autoconfig).

## Features

### Core
- **Web Panels** — Load any website in the sidebar (ChatGPT, Spotify, Discord, etc.)
- **Overlay or Resize mode** — Toggle between sliding over content or pushing it aside
- **Right-side panel** — Sits on the right side of the browser, separate from Zen's built-in left sidebar
- **Persistent panels** — Your web panels and their state persist across browser restarts
- **Add / Remove / Reorder** — Manage panels via a vertical icon strip with drag-to-reorder
- **Keyboard shortcuts** — Global toggle with `Ctrl+Shift+E`, plus per-panel custom keybindings
- **Smooth animations** — Sidebar open/close, auto-hide, and resize-mode content push are all animated with configurable transitions

### Panel Management
- **Settings dialog** — Full GUI for editing panel and global sidebar settings (right-click a panel icon or click the gear icon)
- **Drag resize** — Drag the left edge of the panel to resize; width is saved per-panel
- **Mobile User Agent** — Optionally serve mobile versions of sites for a better sidebar fit
- **Container support** — Assign panels to Firefox Multi-Account Containers for isolated sessions
- **Custom title & favicon** — Override the auto-detected page title and icon
- **CSS selector extraction** — Show only a specific element from a page (e.g. `#main-content`)
- **Tooltip customization** — Choose what the icon tooltip shows: title, URL, both, or off

### Memory & Lifecycle
- **Load on Startup** — Choose which panels load eagerly vs. on-demand
- **Unload on Close** — Automatically unload panels when the sidebar collapses
- **Unload timer** — Automatically unload inactive panels after a configurable delay (5 min – 1 hour, or never) to reclaim memory
- **Auto-reload** — Periodically refresh a panel on a timer (30s – 1 hour)

### Audio & Notifications
- **Audio indicator** — Toolbar icons show a speaker badge when a panel is playing audio
- **Mute / Unmute** — Per-panel audio muting via context menu
- **Notification badges** — Parses unread counts from page titles and shows a red badge on the icon
- **Dynamic title & favicon** — Icons and labels update automatically as pages change

### Zoom
- **Per-panel zoom** — Set a custom zoom level per panel (0.3x – 3.0x)
- **Zoom controls** — Zoom in/out/reset buttons in the navigation bar

### Auto-Hide
- **Auto-hide sidebar** — The sidebar collapses to a thin trigger strip on the right edge; hover to reveal
- **Configurable delay** — Set how long before the sidebar hides after mouse leave (100ms – 5s)

### Context Menu Integration
- **Open Link in Sidebar** — Right-click any link on a page to open it as a new sidebar panel
- **Search in Sidebar** — Right-click selected text to search it in a sidebar panel
- **Move Tab to Sidebar** — Right-click a tab to move it into the sidebar

### Visual Customization
- **Sidebar padding** — Adjust the spacing around the panel area (0 – 24px)
- **Container indicator position** — Choose where the container color dot appears on icons
- **Animation toggle** — Disable all transitions for an instant, snappy feel

## Prerequisites

- [Zen Browser](https://zen-browser.app/) (or Firefox with fx-autoconfig)
- [fx-autoconfig](https://github.com/nicoth-in/user.js#user-content-user-scripts) or equivalent userChrome.js loader installed

### Enable Required Preferences

In `about:config`, set the following:

| Preference | Value |
|---|---|
| `toolkit.legacyUserProfileCustomizations.stylesheets` | `true` |

## Installation

### Bundled (single file)

1. Copy `zen_sidebar.uc.js` into your profile's `chrome/` folder (create it if it doesn't exist).
2. Restart Zen Browser.

### Modular (development)

1. **Locate your Zen Browser profile folder:**
   - Open Zen Browser
   - Go to `about:profiles`
   - Find your active profile and click "Open Folder" next to the Root Directory

2. **Copy files into your profile:**
   ```
   <profile-folder>/
   └── chrome/
       ├── userChrome.css
       ├── JS/
       │   ├── zen_sidebar.uc.mjs
       │   └── zen_sidebar/
       │       ├── sidebar.mjs
       │       ├── panel_manager.mjs
       │       ├── web_panel.mjs
       │       ├── toolbar.mjs
       │       └── sidebar.css
       └── ...
   ```

3. **Restart Zen Browser.**

## Usage

- Press `Ctrl+Shift+E` to toggle the sidebar (or hover the right edge if auto-hide is enabled)
- Click the **+** button at the bottom of the toolbar to add a new web panel
- Click a panel icon to switch between panels; click the active icon again to collapse
- Right-click a panel icon to edit, remove, mute, unload, or reorder it
- Drag the left edge of the panel to resize
- Click the gear icon at the bottom of the toolbar to open global settings

## Configuration

Panel data and settings are stored in Firefox preferences under the `zen.sidebar.*` namespace. You can back up your panels by exporting `zen.sidebar.panels` from `about:config`.

## License

MIT
