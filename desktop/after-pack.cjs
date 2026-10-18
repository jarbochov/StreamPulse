const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * electron-builder afterPack hook.
 * Applies ad-hoc code signature to macOS .app bundles so ARM64 / Apple Silicon
 * and Intel binaries can execute properly without being killed by the kernel.
 */
exports.default = async function(context) {
    if (context.electronPlatformName === 'darwin') {
        const appName = `${context.packager.appInfo.productFilename}.app`;
        const appPath = path.join(context.appOutDir, appName);

        if (fs.existsSync(appPath)) {
            console.log(`[afterPack] Applying ad-hoc code signature to: ${appPath}`);
            try {
                execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });
                console.log('[afterPack] Ad-hoc signature successfully applied.');
            } catch (err) {
                console.error('[afterPack] Warning: ad-hoc signing failed:', err.message);
            }
        }
    }
};
