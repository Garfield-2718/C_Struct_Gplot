import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, extname, dirname } from 'path'
import { mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerCliIpc, spawnCli } from './cli-service'

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
// IPC: 打开文件选择对话框
// mode 为 'file'（默认，选择文件）或 'directory'（选择目录）。
// Windows/Linux 的原生对话框无法同时充当文件选择器与目录选择器：传入
// ['openFile', 'openDirectory'] 时系统只会展示目录选择器，导致文件无法被选中，
// 因此这两个平台按 mode 二选一；macOS 支持二者共存，文件模式下仍可顺带选中目录。
ipcMain.handle('select-project-file', async (_event, mode?: 'file' | 'directory') => {
        let properties: Array<'openFile' | 'openDirectory'> = ['openFile']
        if (mode === 'directory') {
                properties = ['openDirectory']
        } else if (process.platform === 'darwin') {
                properties = ['openFile', 'openDirectory']
        }
        const result = await dialog.showOpenDialog({
                properties,
                filters: [{ name: '所有文件', extensions: ['*'] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
                return null
        }
        return result.filePaths[0]
})

// IPC: 接收渲染进程传来的文件路径，调用 CLI 二进制以 init 模式解析
ipcMain.handle('process-project-file', async (_event, filePath: string) => {
        console.log('[Main] 接收到待处理的文件路径:', filePath)
        const trimmed = typeof filePath === 'string' ? filePath.trim() : ''
        if (!trimmed) {
                return { status: 'failure', filePath, message: '文件路径无效' }
        }
        // db 输出目录：可执行文件所在目录下 struct_list_db/
        const appDir = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
        const dbDir = join(appDir, 'struct_list_db')
        mkdirSync(dbDir, { recursive: true })
        // db 文件名：取传入 filePath 的最后一段文件名（去后缀）+ .db
        const dbName = basename(trimmed, extname(trimmed)) + '.db'
        // 调用 CLI 二进制: --mode=init --input-file --db-path --db-name
        const result = await spawnCli([
                '--mode=init',
                `--input-file=${trimmed}`,
                `--db-path=${dbDir}`,
                `--db-name=${dbName}`
        ])
        const dbFilePath = join(dbDir, dbName)
        console.log('[Main] db 文件路径:', dbFilePath)
        if (result.code === 0) {
                return { status: 'success', filePath, message: result.stdout || '处理完成' }
        }
        return {
                status: 'failure',
                filePath,
                message: result.stderr || `CLI 退出码: ${result.code}`
        }
})

app.whenReady().then(() => {
        // Set app user model id for windows
        electronApp.setAppUserModelId('com.electron')

        // 注册 CLI 相关 IPC（cli:locate / cli:init / cli:svg，当前 init/svg 为打桩）
        registerCliIpc()

        // Default open or close DevTools by F12 in development
        // and ignore CommandOrControl + R in production.
        // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
        app.on('browser-window-created', (_, window) => {
                optimizer.watchWindowShortcuts(window)
        })

        createWindow()

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
