const { app, Tray, Menu, shell, clipboard, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

class AppTray {
    constructor(options = {}) {
        this.mainWindow = options.mainWindow;
        this.getWindow = options.getWindow || (() => this.mainWindow);
        this.onOpenWindow = options.onOpenWindow || null;
        this.serverManager = options.serverManager;
        this.projectRoot = options.projectRoot || path.join(__dirname, '..');
        this.dataDir = options.dataDir || path.join(this.projectRoot, 'data');
        this.tray = null;
    }

    createTrayIcon() {
        if (process.platform === 'darwin') {
            const templatePath = path.join(__dirname, 'tray-iconTemplate.png');
            const standardPath = path.join(__dirname, 'tray-icon.png');
            const iconPath = fs.existsSync(templatePath) ? templatePath : standardPath;

            if (fs.existsSync(iconPath)) {
                try {
                    const img = nativeImage.createFromPath(iconPath);
                    if (img && !img.isEmpty()) {
                        if (typeof img.setTemplateImage === 'function') {
                            img.setTemplateImage(true);
                        }
                        return img;
                    }
                } catch (err) {
                    console.warn('Could not load macOS tray template icon:', err);
                }
            }
        } else {
            // Windows & Linux: select white icon for dark taskbars, black for light taskbars
            const isDark = nativeTheme && nativeTheme.shouldUseDarkColors;
            const darkPath = path.join(__dirname, 'tray-icon.png');
            const whitePath = path.join(__dirname, 'tray-icon-white.png');
            const chosenPath = (isDark && fs.existsSync(whitePath)) ? whitePath : darkPath;

            if (fs.existsSync(chosenPath)) {
                try {
                    const img = nativeImage.createFromPath(chosenPath);
                    if (img && !img.isEmpty()) {
                        return img;
                    }
                } catch (err) {
                    console.warn('Could not load tray icon:', err);
                }
            }
        }

        const svgPath = path.join(this.projectRoot, 'public', 'favicon.svg');
        let icon = null;

        if (fs.existsSync(svgPath)) {
            try {
                icon = nativeImage.createFromPath(svgPath).resize({ width: 18, height: 18 });
            } catch {
                icon = null;
            }
        }

        if (!icon || icon.isEmpty()) {
            icon = nativeImage.createEmpty();
        }

        if (process.platform === 'darwin' && typeof icon.setTemplateImage === 'function') {
            icon.setTemplateImage(true);
        }

        return icon;
    }

    init() {
        if (this.tray) return;

        const icon = this.createTrayIcon();
        this.tray = new Tray(icon);
        this.tray.setToolTip('StreamPulse - Self-Hosted Stream Companion');

        // Dynamically update tray icon on Windows / Linux theme changes
        if (process.platform !== 'darwin' && nativeTheme && typeof nativeTheme.on === 'function') {
            nativeTheme.on('updated', () => {
                if (this.tray && !this.tray.isDestroyed()) {
                    this.tray.setImage(this.createTrayIcon());
                }
            });
        }

        this.updateMenu();

        this.tray.on('click', async () => {
            const win = this.getWindow();
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                if (win.isVisible()) {
                    win.focus();
                } else {
                    win.show();
                }
            } else if (typeof this.onOpenWindow === 'function') {
                await this.onOpenWindow();
            }
        });
    }

    updateMenu() {
        if (!this.tray) return;

        const port = this.serverManager ? this.serverManager.port : 3000;
        const baseUrl = `http://localhost:${port}`;

        const navigateTo = async (route) => {
            try {
                let win = this.getWindow();
                if ((!win || win.isDestroyed()) && typeof this.onOpenWindow === 'function') {
                    win = await this.onOpenWindow();
                }
                if (win && !win.isDestroyed()) {
                    if (win.isMinimized()) win.restore();
                    win.show();
                    win.focus();
                    await win.loadURL(`${baseUrl}${route}`);
                }
            } catch (err) {
                console.error(`[Tray] Navigation error for ${route}:`, err);
            }
        };

        const copyLink = (route) => {
            clipboard.writeText(`${baseUrl}${route}`);
        };

        const contextMenu = Menu.buildFromTemplate([
            {
                label: `StreamPulse (Port ${port})`,
                enabled: false
            },
            { type: 'separator' },
            {
                label: 'Dashboard',
                click: () => navigateTo('/dashboard.html')
            },
            {
                label: 'Custom Overlay Studio',
                click: () => navigateTo('/custom-overlay-editor.html')
            },
            {
                label: 'Credits Studio',
                click: () => navigateTo('/credits-editor.html')
            },
            {
                label: 'Choice Randomizer',
                click: () => navigateTo('/randomizer-editor.html')
            },
            {
                label: 'Game Plan Rundown',
                click: () => navigateTo('/game-plan-editor.html')
            },
            {
                label: 'Alert Queue Dock',
                click: () => navigateTo('/alert-queue.html')
            },
            { type: 'separator' },
            {
                label: 'Copy OBS Overlay URL',
                submenu: [
                    {
                        label: 'Credits Roll',
                        click: () => copyLink('/overlays/credits.html')
                    },
                    {
                        label: 'Choice Randomizer (All Modes)',
                        click: () => copyLink('/overlays/randomizer.html')
                    },
                    {
                        label: 'Choice Randomizer — Card Deck',
                        click: () => copyLink('/overlays/randomizer.html?mode=deck')
                    },
                    {
                        label: 'Choice Randomizer — Slot Roller',
                        click: () => copyLink('/overlays/randomizer.html?mode=roller')
                    },
                    {
                        label: 'Choice Randomizer — Wheel',
                        click: () => copyLink('/overlays/randomizer.html?mode=wheel')
                    },
                    {
                        label: 'Game Plan Ticker',
                        click: () => copyLink('/overlays/game-plan.html')
                    },
                    {
                        label: 'Community Goals',
                        click: () => copyLink('/overlays/goal.html')
                    },
                    {
                        label: 'Now Playing Music',
                        click: () => copyLink('/overlays/music.html')
                    }
                ]
            },
            {
                label: 'Open Data Folder',
                click: () => {
                    const dataPath = this.dataDir;
                    if (fs.existsSync(dataPath)) {
                        shell.openPath(dataPath);
                    }
                }
            },
            {
                label: 'Bitfocus Companion (Stream Deck)',
                click: () => shell.openExternal('https://github.com/jarbochov/companion-module-streampulse')
            },
            { type: 'separator' },
            {
                label: 'Restart Server',
                click: async () => {
                    if (this.serverManager) {
                        try {
                            await this.serverManager.restart();
                            const win = this.getWindow();
                            if (win && !win.isDestroyed()) {
                                win.reload();
                            }
                        } catch (err) {
                            console.error('[Tray] Failed to restart server:', err);
                        }
                    }
                }
            },
            {
                label: 'Quit StreamPulse',
                click: () => {
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}

module.exports = { AppTray };
