#!/usr/bin/env node
/**
 * build-cli.mjs —— 构建 C_Struct_Gplot_CLI 的 PyInstaller 单文件二进制，
 * 并放置到 Electron 项目的 binaries/<platformDir>/ 目录下，供 electron-builder
 * 通过 extraResources 随应用一起打包。
 *
 * 设计要点：
 *  - 跨平台（Windows / Linux / macOS），纯 Node ESM，不依赖任何第三方包。
 *  - PyInstaller 不能交叉编译，必须在目标平台本机构建对应二进制。
 *  - 平台映射（platformDir / exeName）是与主进程 src/main/cli-service.ts 共享的契约，
 *    两侧必须严格一致，禁止直接使用 `${process.platform}-${process.arch}`
 *    （因为 Windows 下 process.platform 是 'win32' 而非 'windows'）。
 *  - 本脚本【绝不】执行 sudo；探测到 PyInstaller 缺失时只打印安装指引并以退出码 1 退出。
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'

// ---------------------------------------------------------------------------
// 硬编码常量（按计划书要求：写死在脚本顶部，不读取环境变量）
// ---------------------------------------------------------------------------

/** 为 true 时直接使用本地 CLI 源码目录（仅开发调试用），跳过 git clone。 */
const USE_LOCAL_CLI = false
/** 本地 CLI 源码目录（USE_LOCAL_CLI 为 true 时生效）。 */
const LOCAL_CLI_DIR = '/home/wsl/code/C_Struct_Gplot_CLI'
/** 默认从该 GitHub 仓库 clone CLI 源码。 */
const CLI_REPO = 'https://github.com/Garfield-2718/C_Struct_Gplot_CLI.git'
/** clone 缓存目录（相对仓库根，需加入 .gitignore）。 */
const CLI_CACHE_DIR = '.cli-src'

/** git 网络操作超时：首次握手可能 >20s，统一放宽到 120s。 */
const GIT_TIMEOUT_MS = 120000

/** 统一日志前缀。 */
const LOG_PREFIX = '[build-cli]'

// ---------------------------------------------------------------------------
// 平台映射（共享契约，必须与 src/main/cli-service.ts 完全一致）
// ---------------------------------------------------------------------------

const systemTag =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
const archTag = process.arch === 'arm64' ? 'arm64' : 'x64'
const platformDir = `${systemTag}-${archTag}`
const exeName = process.platform === 'win32' ? 'struct_topology.exe' : 'struct_topology'
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

// ---------------------------------------------------------------------------
// 仓库根目录解析（脚本位于 scripts/ 下，root = resolve(dirname, '..')）
// ---------------------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

// ---------------------------------------------------------------------------
// 通用工具：日志 / 退出 / 子进程封装
// ---------------------------------------------------------------------------

function log(message) {
    console.log(`${LOG_PREFIX} ${message}`)
}

/** 打印错误并以指定退出码结束进程（默认 1）。 */
function fail(message, code = 1) {
    console.error(`${LOG_PREFIX} ${message}`)
    process.exit(code)
}

/**
 * 以 stdio:'inherit' 运行命令，实时透传输出。
 * 返回进程退出码；命令无法启动、超时或被信号终止时直接 fail。
 */
function runInherit(cmd, args, options = {}) {
    const res = spawnSync(cmd, args, { stdio: 'inherit', ...options })
    if (res.error) {
        // spawnSync 超时会 kill 子进程并置 res.error.code='ETIMEDOUT'，与“命令无法启动”
        // (ENOENT 等) 一样都从此分支暴露，因此超时诊断必须放在这里（而非下方 status 分支）。
        if (res.error.code === 'ETIMEDOUT') {
            fail(`命令 "${cmd} ${args.join(' ')}" 执行超时（>${options.timeout}ms），已终止`)
        }
        fail(`无法执行命令 "${cmd}"：${res.error.message}`)
    }
    // 走到这里说明 res.error 为空但 status 非数字：子进程被信号终止（如外部 kill），并非超时。
    if (typeof res.status !== 'number') {
        const reason = res.signal ? `signal ${res.signal}` : '未知原因'
        fail(`命令 "${cmd} ${args.join(' ')}" 未正常退出（${reason}）`)
    }
    return res.status
}

/**
 * 运行命令并捕获 stdout/stderr（用于 git rev-parse 等需要读取输出的场景）。
 * 返回 { status, stdout, stderr }，输出已 trim。
 */
function runCapture(cmd, args, options = {}) {
    const res = spawnSync(cmd, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
    })
    if (res.error) {
        fail(`无法执行命令 "${cmd}"：${res.error.message}`)
    }
    return {
        status: typeof res.status === 'number' ? res.status : 1,
        stdout: (res.stdout || '').trim(),
        stderr: (res.stderr || '').trim()
    }
}

// ---------------------------------------------------------------------------
// 步骤 1：解析 / 获取 CLI 源码目录
// ---------------------------------------------------------------------------

function resolveCliSource() {
    // 开发调试：直接使用硬编码的本地目录。
    if (USE_LOCAL_CLI) {
        log(`步骤1/5 · 使用本地 CLI 源码目录：${LOCAL_CLI_DIR}`)
        if (!existsSync(LOCAL_CLI_DIR)) {
            fail(`本地 CLI 源码目录不存在：${LOCAL_CLI_DIR}（请检查 LOCAL_CLI_DIR 常量）`)
        }
        return LOCAL_CLI_DIR
    }

    // 默认：使用仓库根下的 clone 缓存目录 .cli-src。
    const cacheDir = resolve(repoRoot, CLI_CACHE_DIR)
    log(`步骤1/5 · 使用 clone 缓存目录：${cacheDir}`)

    if (!existsSync(cacheDir)) {
        log(`缓存不存在，开始 clone：${CLI_REPO}`)
        const status = runInherit('git', ['clone', CLI_REPO, cacheDir], {
            cwd: repoRoot,
            timeout: GIT_TIMEOUT_MS
        })
        if (status !== 0) {
            fail(`git clone 失败（退出码 ${status}）`)
        }
        log('clone 完成')
        return cacheDir
    }

    // 缓存已存在：fetch + 校准 origin/HEAD + 比对，落后才 --ff-only 更新。
    log('缓存已存在，校验是否为最新代码…')

    // (1) 拉取远端最新引用。
    const fetchStatus = runInherit('git', ['fetch', 'origin'], {
        cwd: cacheDir,
        timeout: GIT_TIMEOUT_MS
    })
    if (fetchStatus !== 0) {
        fail(`git fetch 失败（退出码 ${fetchStatus}）`)
    }

    // (2) 校准 origin/HEAD 指向远端“真实默认分支”：
    //     git fetch 不保证更新本地 origin/HEAD 符号引用（可能过时甚至缺失），
    //     直接比对 origin/HEAD 会误判，故先向远端查询并写回该符号引用。
    const setHeadStatus = runInherit('git', ['remote', 'set-head', 'origin', '-a'], {
        cwd: cacheDir,
        timeout: GIT_TIMEOUT_MS
    })
    if (setHeadStatus !== 0) {
        fail(`git remote set-head origin -a 失败（退出码 ${setHeadStatus}），无法确定远端默认分支`)
    }

    // (3) 解析远端默认分支名（如 origin/master），用于稳健比对与清晰日志。
    const branchRes = runCapture('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], {
        cwd: cacheDir
    })
    if (branchRes.status !== 0 || !branchRes.stdout) {
        fail(`无法解析远端默认分支：${branchRes.stderr || `退出码 ${branchRes.status}`}`)
    }
    const remoteBranch = branchRes.stdout

    // (4) 比对本地 HEAD 与远端默认分支 tip。
    const local = runCapture('git', ['rev-parse', 'HEAD'], { cwd: cacheDir })
    const remote = runCapture('git', ['rev-parse', remoteBranch], { cwd: cacheDir })
    if (local.status !== 0) {
        fail(`无法解析本地 HEAD：${local.stderr || `退出码 ${local.status}`}`)
    }
    if (remote.status !== 0) {
        fail(`无法解析 ${remoteBranch}：${remote.stderr || `退出码 ${remote.status}`}`)
    }

    const localShort = local.stdout.slice(0, 7)
    const remoteShort = remote.stdout.slice(0, 7)
    if (local.stdout === remote.stdout) {
        log(`已是最新（${remoteBranch} @ ${localShort}），复用缓存`)
        return cacheDir
    }

    // 两者不一致（方向未知：可能落后 / 领先 / 分叉），仅尝试快进更新；
    // 若无法快进（本地领先或已分叉），--ff-only 会失败并给出清晰报错。
    log(
        `本地 HEAD（${localShort}）与 ${remoteBranch}（${remoteShort}）不一致，尝试 git pull --ff-only 快进更新`
    )
    const pullStatus = runInherit('git', ['pull', '--ff-only'], {
        cwd: cacheDir,
        timeout: GIT_TIMEOUT_MS
    })
    if (pullStatus !== 0) {
        fail(
            `git pull --ff-only 失败（退出码 ${pullStatus}）：缓存可能与 ${remoteBranch} 分叉或本地领先，请手动检查或删除 ${cacheDir} 后重试`
        )
    }
    log('更新完成')
    return cacheDir
}

// ---------------------------------------------------------------------------
// 步骤 2：环境探测（PyInstaller 是否可用）—— 缺失时只给指引，绝不 sudo
// ---------------------------------------------------------------------------

function probePyInstaller() {
    log(`步骤2/5 · 探测 PyInstaller：${pythonCmd} -c "import PyInstaller"`)
    const res = spawnSync(pythonCmd, ['-c', 'import PyInstaller'], { stdio: 'ignore' })

    if (res.error) {
        console.error(`${LOG_PREFIX} 无法执行 Python 解释器 "${pythonCmd}"：${res.error.message}`)
        fail('未找到 Python，请确认已安装 Python 3 并加入 PATH 后重试')
    }

    if (res.status === 0) {
        log('PyInstaller 探测通过')
        return
    }

    // 导入失败：打印清晰的安装指引后退出（不自动安装、不执行 sudo）。
    const hints = [
        'PyInstaller 未安装（或当前 Python 环境不可导入 PyInstaller）。',
        '本脚本不会自动执行 sudo 或安装依赖，请手动安装 pip 与 PyInstaller 后重试：',
        ''
    ]
    if (process.platform === 'win32') {
        hints.push('  Windows : python -m pip install --user pyinstaller')
    } else if (process.platform === 'darwin') {
        hints.push('  macOS   : python3 -m pip install --user pyinstaller')
    } else {
        hints.push(
            '  Linux/WSL: sudo apt install -y python3-pip python3-venv && python3 -m pip install --user pyinstaller'
        )
    }
    hints.push('', `安装后可用 "${pythonCmd} -m PyInstaller --version" 验证。`)
    for (const line of hints) {
        console.error(`${LOG_PREFIX} ${line}`)
    }
    fail('环境探测失败：缺少 PyInstaller', 1)
}

// ---------------------------------------------------------------------------
// 步骤 3：调用 CLI 自带的 build_package.py 构建（默认即 onefile，禁止传 --onefile）
// ---------------------------------------------------------------------------

function buildCli(cliDir) {
    const buildScript = join(cliDir, 'build_package', 'build_package.py')
    log(`步骤3/5 · 调用打包脚本：${pythonCmd} ${buildScript}`)
    if (!existsSync(buildScript)) {
        fail(`未找到打包脚本：${buildScript}`)
    }
    // 注意：build_package.py 的 argparse 不接受 --onefile（默认行为已是单文件）；
    // 传入未知参数会导致 argparse 报错并以退出码 2 退出，故此处不传任何 --onefile。
    const status = runInherit(pythonCmd, [buildScript], { cwd: cliDir })
    if (status !== 0) {
        fail(`build_package.py 构建失败（退出码 ${status}）`)
    }
    log('CLI 构建完成')
}

// ---------------------------------------------------------------------------
// 步骤 4：定位构建产物 <cli>/build_package/dist/<platformDir>/<exeName>
// ---------------------------------------------------------------------------

function locateArtifact(cliDir) {
    const artifact = join(cliDir, 'build_package', 'dist', platformDir, exeName)
    log(`步骤4/5 · 定位构建产物：${artifact}`)
    if (!existsSync(artifact)) {
        fail(
            `未找到构建产物：${artifact}（请确认 build_package.py 输出与平台映射 platformDir="${platformDir}"）`
        )
    }
    return artifact
}

// ---------------------------------------------------------------------------
// 步骤 5：复制产物到 binaries/<platformDir>/<exeName>，非 Windows 保留可执行位
// ---------------------------------------------------------------------------

function copyArtifact(artifact) {
    const destDir = join(repoRoot, 'binaries', platformDir)
    const dest = join(destDir, exeName)
    log(`步骤5/5 · 复制产物到：${dest}`)

    mkdirSync(destDir, { recursive: true })
    copyFileSync(artifact, dest)

    if (process.platform !== 'win32') {
        chmodSync(dest, 0o755)
        log('已设置可执行位 (0o755)')
    }
    return dest
}

// ---------------------------------------------------------------------------
// 参数校验：--target <win|linux|mac>（防止跨平台误打包）
// ---------------------------------------------------------------------------

/**
 * 校验可选参数 --target：PyInstaller 不能交叉编译，若显式指定的目标平台与宿主
 * process.platform 推导出的平台不一致，立即 fail，避免“在 Linux 上跑 dist:win 却
 * 静默只产出 linux-x64 二进制、导致 electron-builder --win 从空的 binaries/windows-x64
 * 打出缺少 struct_topology.exe 的安装包”。不传 --target 时按宿主平台正常执行。
 */
function validateTarget() {
    const args = process.argv.slice(2)
    const idx = args.indexOf('--target')
    if (idx === -1) {
        log('未指定 --target，按宿主平台构建')
        return
    }

    const value = args[idx + 1]
    if (value === undefined || value.startsWith('--')) {
        fail('--target 缺少参数值，用法：--target <win|linux|mac>')
    }

    const TARGET_TO_SYSTEM = { win: 'windows', linux: 'linux', mac: 'macos' }
    const expectedSystem = TARGET_TO_SYSTEM[value]
    if (!expectedSystem) {
        fail(`无效的 --target 值："${value}"（可选：win | linux | mac）`)
    }

    if (expectedSystem !== systemTag) {
        fail(
            `--target "${value}"（目标系统 ${expectedSystem}）与当前宿主平台（${systemTag}，process.platform=${process.platform}）不一致；` +
                `PyInstaller 不能交叉编译，请在 ${value} 平台本机执行，或移除 --target 参数`
        )
    }
    log(`--target "${value}" 与宿主平台一致（${expectedSystem}），继续构建`)
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
    log(`仓库根目录：${repoRoot}`)
    log(`平台映射：platformDir="${platformDir}" · exeName="${exeName}" · pythonCmd="${pythonCmd}"`)
    validateTarget()

    const cliDir = resolveCliSource()
    probePyInstaller()
    buildCli(cliDir)
    const artifact = locateArtifact(cliDir)
    const dest = copyArtifact(artifact)

    log(`全部完成 ✓ CLI 二进制已就绪：${dest}`)
}

try {
    main()
} catch (err) {
    fail(err && err.stack ? err.stack : String(err))
}
