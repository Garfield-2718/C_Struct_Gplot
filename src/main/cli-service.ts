import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'

// 平台映射（共享契约，必须与 scripts/build-cli.mjs 完全一致）
const systemTag =
        process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
const archTag = process.arch === 'arm64' ? 'arm64' : 'x64'
const platformDir = `${systemTag}-${archTag}`
const exeName = process.platform === 'win32' ? 'struct_topology.exe' : 'struct_topology'

/** 解析 CLI 二进制的绝对路径（真实实现，可立即验证打包是否成功） */
export function resolveCliBinary(): string {
        if (app.isPackaged) {
                return join(process.resourcesPath, 'cli', exeName)
        }
        return join(app.getAppPath(), 'binaries', platformDir, exeName)
}

export interface CliResult {
        code: number
        stdout: string
        stderr: string
}

/** CLI 子进程超时（毫秒），防止挂起拖垮主进程 */
const CLI_TIMEOUT_MS = 60_000

/**
 * 通用 CLI 调用助手（真实实现）
 * cwd 指向 userData：CLI 的 output/、.temp_file 依赖 os.getcwd()，需可写目录。
 * 进程无法启动（ENOENT）、超时或非零退出时均 resolve（不 reject），便于调用方检查 code/stderr。
 */
export function spawnCli(args: string[]): Promise<CliResult> {
        return new Promise((resolve) => {
                execFile(
                        resolveCliBinary(),
                        args,
                        {
                                cwd: app.getPath('userData'),
                                maxBuffer: 10 * 1024 * 1024,
                                timeout: CLI_TIMEOUT_MS
                        },
                        (err, stdout, stderr) => {
                                if (err) {
                                        // 超时：Node 会 kill 子进程，err.killed === true
                                        if (err.killed) {
                                                resolve({
                                                        code: 1,
                                                        stdout: stdout ?? '',
                                                        stderr: `[cli-service] 进程超时（${CLI_TIMEOUT_MS}ms），已终止`
                                                })
                                                return
                                        }
                                        // ENOENT 等启动失败：stderr 为空，用 err.message 提供诊断
                                        // 非零退出：stderr 已含子进程输出，直接使用，不重复拼接 err.message
                                        const stderrContent = stderr ? stderr : err.message
                                        resolve({
                                                code: typeof err.code === 'number' ? err.code : 1,
                                                stdout: stdout ?? '',
                                                stderr: stderrContent
                                        })
                                        return
                                }
                                resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' })
                        }
                )
        })
}

/** runInit 打桩：仅记录解析路径与参数，返回占位结果 */
export function runInitStub(...args: unknown[]): { ok: boolean; message: string; cliPath: string } {
        // TODO: 调用 spawnCli 并解析 SVG/DB 输出，后续实现
        console.log('[cli-service] runInit stub', resolveCliBinary(), args)
        return { ok: false, message: 'runInit not implemented (stub)', cliPath: resolveCliBinary() }
}

/** runSvg 打桩：仅记录解析路径与参数，返回占位结果 */
export function runSvgStub(...args: unknown[]): { ok: boolean; message: string; cliPath: string } {
        // TODO: 调用 spawnCli 并解析 SVG/DB 输出，后续实现
        console.log('[cli-service] runSvg stub', resolveCliBinary(), args)
        return { ok: false, message: 'runSvg not implemented (stub)', cliPath: resolveCliBinary() }
}

/** 注册 CLI 相关 IPC 通道（在 app.whenReady 后调用） */
export function registerCliIpc(): void {
        ipcMain.handle('cli:locate', () => resolveCliBinary())
        ipcMain.handle('cli:init', () => runInitStub())
        ipcMain.handle('cli:svg', () => runSvgStub())
}
