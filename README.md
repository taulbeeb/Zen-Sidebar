# Zen Sidebar

A Vivaldi/Edge-style web panel sidebar for [Zen Browser](https://zen-browser.app/), implemented as a `chrome/` folder customization using userChrome.js (fx-autoconfig).

## Features

- **Web Panels** - Load any website in the sidebar (ChatGPT, Spotify, Discord, etc.)
- **Overlay or Resize mode** - Toggle between sliding over content or pushing it aside
- **Right-side panel** - Sits on the right side of the browser, separate from Zen's built-in left sidebar
- **Persistent panels** - Your web panels and their state persist across browser restarts
- **Add/remove/reorder** - Manage panels via a vertical icon strip
- **Keyboard shortcut** - Toggle the sidebar with `Ctrl+Shift+B` (customizable)

## Prerequisites

- [Zen Browser](https://zen-browser.app/) (or Firefox with fx-autoconfig)
- [fx-autoconfig](https://github.com/nicoth-in/user.js#user-content-user-scripts) or equivalent userChrome.js loader installed

### Enable Required Preferences

In `about:config`, set the following:

| Preference | Value |
|---|---|
| `toolkit.legacyUserProfileCustomizations.stylesheets` | `true` |

## Installation

1. **Locate your Zen Browser profile folder:**
   - Open Zen Browser
   - Go to `about:profiles`
   - Find your active profile and click "Open Folder" next to the Root Directory

2. **Copy files into your profile:**
   ```
   <profile-folder>/
   └── chrome/
       ├── userChrome.css          (merge with existing if you have one)
       ├── JS/
       │   ├── zen_sidebar.uc.mjs  (main entry point)
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

- Click the sidebar toggle button (right edge of the browser) or press `Ctrl+Shift+B`
- Right-click the sidebar toolbar to add a new web panel
- Click a panel icon to switch between panels
- Right-click a panel icon to edit or remove it
- Use the mode toggle button at the bottom of the toolbar to switch between overlay and resize modes

## Configuration

Panel data is stored in `zen-sidebar-panels` preference. You can back up your panels by exporting this pref from `about:config`.

## License

MIT
