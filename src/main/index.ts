import { app, shell, BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerCliIpc } from './cli-service'
import { registerIpcHandlers } from './ipc-handlers'
import { getSettingsLocale, onSettingsLocaleSaved } from './settings-service'
import { translate } from '../shared/locales/translate'
import type { MessageKey } from '../shared/locales/types'
import type { AppLocale } from '../shared/settings'

/** 复用 Electron 已生成的完整默认菜单，不自行删减平台角色或帮助链接。 */
const MENU_ROLE_KEYS: Record<string, MessageKey> = {
    filemenu: 'native.fileMenu',
    editmenu: 'native.editMenu',
    viewmenu: 'native.viewMenu',
    windowmenu: 'native.windowMenu',
    help: 'native.helpMenu',
    about: 'native.about',
    services: 'native.services',
    hide: 'native.hide',
    hideothers: 'native.hideOthers',
    unhide: 'native.unhide',
    quit: 'native.quit',
    close: 'native.close',
    undo: 'native.undo',
    redo: 'native.redo',
    cut: 'native.cut',
    copy: 'native.copy',
    paste: 'native.paste',
    pasteandmatchstyle: 'native.pasteAndMatchStyle',
    delete: 'native.delete',
    selectall: 'native.selectAll',
    reload: 'native.reload',
    forcereload: 'native.forceReload',
    toggledevtools: 'native.toggleDevTools',
    resetzoom: 'native.resetZoom',
    zoomin: 'native.zoomIn',
    zoomout: 'native.zoomOut',
    togglefullscreen: 'native.toggleFullscreen',
    minimize: 'native.minimize',
    zoom: 'native.zoom',
    front: 'native.front',
    window: 'native.window',
    startspeaking: 'native.startSpeaking',
    stopspeaking: 'native.stopSpeaking',
    showsubstitutions: 'native.showSubstitutions',
    togglesmartquotes: 'native.smartQuotes',
    togglesmartdashes: 'native.smartDashes',
    toggletextreplacement: 'native.textReplacement',
    toggletabbar: 'native.showTabBar',
    selectnexttab: 'native.selectNextTab',
    selectprevioustab: 'native.selectPreviousTab',
    mergeallwindows: 'native.mergeAllWindows',
    movetabtonewwindow: 'native.moveTabToNewWindow'
}

/** 默认菜单里没有 role 的固定标签；只识别原始默认菜单，绝不据翻译文案判断业务状态。 */
const DEFAULT_MENU_LABEL_KEYS: Record<string, MessageKey> = {
    File: 'native.fileMenu',
    Edit: 'native.editMenu',
    View: 'native.viewMenu',
    Window: 'native.windowMenu',
    Help: 'native.helpMenu',
    'Learn More': 'native.learnMore',
    Documentation: 'native.documentation',
    'Community Discussions': 'native.community',
    'Search Issues': 'native.searchIssues',
    Speech: 'native.speech',
    Substitutions: 'native.substitutions'
}

function localizeDefaultMenu(
    original: Menu,
    locale: AppLocale,
    current: Menu | null
): MenuItemConstructorOptions[] {
    return original.items.map((item, index) => {
        const state = current?.items[index] ?? item
        const key =
            MENU_ROLE_KEYS[item.role?.toLowerCase() ?? ''] ??
            DEFAULT_MENU_LABEL_KEYS[item.label.replaceAll('&', '')]
        const options: MenuItemConstructorOptions = {
            id: item.id,
            role: item.role,
            type: item.type,
            label: key ? translate(locale, key, { app: app.getName() }) : item.label,
            sublabel: item.sublabel,
            toolTip: item.toolTip,
            accelerator: item.userAccelerator ?? item.accelerator ?? undefined,
            registerAccelerator: item.registerAccelerator,
            enabled: state.enabled,
            visible: state.visible,
            icon: item.icon
        }
        if (item.type === 'checkbox' || item.type === 'radio') options.checked = state.checked
        if (item.submenu) {
            options.submenu = localizeDefaultMenu(item.submenu, locale, state.submenu ?? null)
        }
        if (!item.role) {
            // MenuItem.click 与构造选项 click 的参数顺序不同，保留原始帮助链接等回调。
            options.click = (_menuItem, window, event) => {
                item.click(event, window, BrowserWindow.getFocusedWindow()?.webContents)
            }
        }
        return options
    })
}

function initializeNativeMenu(locale: AppLocale): void {
    const original = Menu.getApplicationMenu()
    if (!original) return
    const refresh = (nextLocale: AppLocale): void => {
        Menu.setApplicationMenu(
            Menu.buildFromTemplate(
                localizeDefaultMenu(original, nextLocale, Menu.getApplicationMenu())
            )
        )
    }
    refresh(locale)
    const unsubscribe = onSettingsLocaleSaved(refresh)
    app.once('will-quit', unsubscribe)
}

// WSL2/Linux 虚拟显卡驱动可能导致 GPU 进程反复崩溃（exit_code=11），
// 此环境下关闭硬件加速改用软件渲染；Windows/macOS 保持默认 GPU 加速
if (process.platform === 'linux') {
    app.disableHardwareAcceleration()
}

function createWindow(): void {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 900,
        height: 670,
        show: false,
        autoHideMenuBar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // 防止拖拽文件时 Electron 默认导航到该文件
    mainWindow.webContents.on('will-navigate', (event) => {
        event.preventDefault()
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    const locale = getSettingsLocale()
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // 注册 CLI 相关 IPC（cli:locate / cli:init / cli:svg，当前 init/svg 为打桩）
    registerCliIpc()

    // 注册与渲染进程通信的 IPC（select-project-file / process-project-file / add-node）
    registerIpcHandlers()

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    createWindow()
    initializeNativeMenu(locale)

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
