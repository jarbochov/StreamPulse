const { app, Tray, Menu, shell, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

class AppTray {
    constructor(options = {}) {
        this.mainWindow = options.mainWindow;
        this.serverManager = options.serverManager;
        this.projectRoot = options.projectRoot || path.join(__dirname, '..');
        this.tray = null;
    }

    createTrayIcon() {
        // Try creating an icon or generate a fallback native image
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
            // Generate a 16x16 purple circle icon buffer
            const size = 16;
            const canvas = nativeImage.createEmpty();
            icon = canvas;
        }

        return icon;
    }

    init() {
        if (this.tray) return;

        const icon = this.createTrayIcon();
        this.tray = new Tray(icon);
        this.tray.setToolTip('StreamPulse - Self-Hosted Stream Companion');

        this.updateMenu();

        this.tray.on('click', () => {
            if (this.mainWindow) {
                if (this.mainWindow.isVisible()) {
                    this.mainWindow.focus();
                } else {
                    this.mainWindow.show();
                }
            }
        });
    }

    updateMenu() {
        if (!this.tray) return;

        const port = this.serverManager ? this.serverManager.port : 3000;
        const baseUrl = `http://localhost:${port}`;

        const navigateTo = (route) => {
            if (this.mainWindow) {
                this.mainWindow.loadURL(`${baseUrl}${route}`);
                this.mainWindow.show();
                this.mainWindow.focus();
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
                        label: 'Choice Randomizer',
                        click: () => copyLink('/overlays/randomizer.html')
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
                    const dataPath = path.join(this.projectRoot, 'data');
                    if (fs.existsSync(dataPath)) {
                        shell.openPath(dataPath);
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Restart Server',
                click: async () => {
                    if (this.serverManager) {
                        try {
                            await this.serverManager.restart();
                            if (this.mainWindow) {
                                this.mainWindow.reload();
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
                    app.isQuitting = true;
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
