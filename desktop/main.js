const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { ServerManager } = require('./server-manager');
const { AppTray } = require('./tray');

// Enforce single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow = null;
let appTray = null;
let serverManager = null;
app.isQuitting = false;

async function createWindow() {
    const projectRoot = path.join(__dirname, '..');
    const port = serverManager ? serverManager.port : 3000;
    const baseUrl = `http://localhost:${port}`;

    mainWindow = new BrowserWindow({
        width: 1360,
        height: 860,
        minWidth: 1024,
        minHeight: 680,
        backgroundColor: '#0d1117',
        title: 'StreamPulse',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Gracefully show window once ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle close button: hide to tray during active stream unless user explicitly quits
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Open external links (Twitch, docs, etc.) in the user's default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Load initial dashboard
    await mainWindow.loadURL(`${baseUrl}/dashboard.html`);

    // Build application menu
    buildMenu(baseUrl);

    // Initialize System Tray
    appTray = new AppTray({
        mainWindow,
        serverManager,
        projectRoot
    });
    appTray.init();
}

function buildMenu(baseUrl) {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                {
                    label: 'Quit StreamPulse',
                    accelerator: 'Command+Q',
                    click: () => {
                        app.isQuitting = true;
                        app.quit();
                    }
                }
            ]
        }] : []),
        {
            label: 'Navigation',
            submenu: [
                {
                    label: 'Dashboard',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/dashboard.html`)
                },
                {
                    label: 'Custom Overlay Studio',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/custom-overlay-editor.html`)
                },
                {
                    label: 'Credits Studio',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/credits-editor.html`)
                },
                {
                    label: 'Choice Randomizer',
                    accelerator: 'CmdOrCtrl+4',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/randomizer-editor.html`)
                },
                {
                    label: 'Game Plan Rundown',
                    accelerator: 'CmdOrCtrl+5',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/game-plan-editor.html`)
                },
                {
                    label: 'Community Directory',
                    accelerator: 'CmdOrCtrl+6',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/analytics.html`)
                },
                {
                    label: 'Alert Queue Dock',
                    accelerator: 'CmdOrCtrl+7',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/alert-queue.html`)
                },
                {
                    label: 'Config Editor',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => mainWindow && mainWindow.loadURL(`${baseUrl}/config-editor.html`)
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Online Documentation',
                    click: () => shell.openExternal('https://jarbochov.github.io/StreamPulse/')
                },
                {
                    label: 'SocialStream Ninja Setup Guide',
                    click: () => shell.openExternal('https://jarbochov.github.io/StreamPulse/#/socialstream-setup')
                },
                {
                    label: 'GitHub Repository',
                    click: () => shell.openExternal('https://github.com/jarbochov/StreamPulse')
                },
                {
                    label: 'Open Data Directory',
                    click: () => {
                        const dataPath = path.join(__dirname, '..', 'data');
                        if (fs.existsSync(dataPath)) {
                            shell.openPath(dataPath);
                        }
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
ipcMain.handle('get-server-port', () => serverManager ? serverManager.port : 3000);
ipcMain.handle('open-data-folder', () => {
    const dataPath = path.join(__dirname, '..', 'data');
    if (fs.existsSync(dataPath)) {
        shell.openPath(dataPath);
    }
});

// App lifecycle
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }
});

app.whenReady().then(async () => {
    const projectRoot = path.join(__dirname, '..');
    serverManager = new ServerManager({ projectRoot });

    console.log('[Desktop] Booting StreamPulse background server...');
    serverManager.start();

    try {
        await serverManager.waitForReady();
        console.log(`[Desktop] Server ready on port ${serverManager.port}. Launching window...`);
        await createWindow();
    } catch (err) {
        console.error('[Desktop] Failed starting backend server:', err.message);
        app.quit();
    }
});

app.on('before-quit', async (event) => {
    if (serverManager && !serverManager.isStopping) {
        event.preventDefault();
        app.isQuitting = true;
        console.log('[Desktop] Stopping backend server before application exit...');
        if (appTray) appTray.destroy();
        await serverManager.stop();
        app.quit();
    }
});
