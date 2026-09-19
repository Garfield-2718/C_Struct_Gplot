import { app, ipcMain, dialog } from 'electron'
import { join, basename, extname, dirname } from 'path'
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'fs'
import { spawnCli } from './cli-service'
import {
    findStructRecords,
    findStructRecordsByHash,
    findStructNamesByHashes,
    resolveDbPath,
    resolveDefaultDbDir,
    findParentHashes,
    setActiveDbPath,
    validateStructDb
} from './db-service'
import type { StructRecord } from './db-service'
import {
    treeInsert,
    treeGetSize,
    treeFindByHash,
    treeInsertLabels,
    treeFindLabel,
    buildLabel
} from './rbtree-service'
import { getSettingsLocale, loadSettings, saveSettings } from './settings-service'
import type { SettingsData } from './settings-service'
import { createIpcFailure, errorMessageKey } from '../shared/errors'
import type { AppError, IpcFailure, IpcResultContext } from '../shared/errors'
import { EXPORT_EXTENSIONS } from '../shared/export'
import type { ExportFormat, ExportSavePayload, ExportSaveResult } from '../shared/export'
import { translate } from '../shared/locales/translate'
import type { MessageKey } from '../shared/locales/types'

/** message 保留兼容；渲染端只用 error.code/params 翻译，原始诊断保留在 detail。 */
function localizedFailure(error: AppError, context: IpcResultContext): IpcFailure {
    return createIpcFailure(error, {
        ...context,
        message: translate(getSettingsLocale(), errorMessageKey(error.code), error.params)
    })
}

/** load-struct 通道入参：要加载的结构体标识与可选的数据库路径、类型限定 */
interface LoadStructPayload {
    dbPath?: string
    structName: string
    dataTypeFirst?: string
}

/** add-node 通道返回结构：success 为是否成功写入红黑树，hashes 为写入节点的 hash 列表 */
interface AddNodeResult {
    success: boolean
    hashes: string[]
}

/** 已知复合类型前缀，与 CLI data_type_first 取值一致 */
const STRUCT_TYPE_KEYWORDS = ['struct', 'union', 'enum']

/** 导出格式 → 原生保存对话框过滤器名称的翻译键 */
const EXPORT_FILTER_NAME_KEYS: Record<ExportFormat, MessageKey> = {
    pdf: 'native.pdfDocument',
    png: 'native.pngImage',
    svg: 'native.svgImage',
    jpeg: 'native.jpegImage'
}

/**
 * 解析渲染进程传入的结构体标识：
 * "struct hapd_interfaces" → { dataTypeFirst: 'struct', structName: 'hapd_interfaces' }；
 * "hapd_interfaces"（无类型前缀）→ { dataTypeFirst: undefined, structName: 'hapd_interfaces' }。
 */
function parseStructIdentity(input: string): { dataTypeFirst?: string; structName: string } {
    const parts = input.trim().split(/\s+/)
    if (parts.length >= 2 && STRUCT_TYPE_KEYWORDS.includes(parts[0])) {
        return { dataTypeFirst: parts[0], structName: parts.slice(1).join(' ') }
    }
    return { structName: input.trim() }
}

/** 画布渲染所需的结构体节点数据格式，与 renderer 侧 useCanvasView.ts 的 StructNodeData 对齐 */
interface CanvasStructNodeData {
    title: string
    kind: 'struct' | 'enum' | 'union'
    width: number
    collapsed: boolean
    fields: string[]
    /** 与 fields 同序：每个字段指向的子结构体 hash 数组（无子节点则为 null），用于自动连线与侧边栏展示 */
    childHashes: (string[] | null)[]
    /** 引用当前结构体的父结构体 hash 列表（来自 relations 表），用于侧边栏展示 */
    parentHashes: string[]
    /** 源文件路径（来自 structures 表 source_file 列），用于侧边栏「源文件」展示 */
    sourceFile: string | null
}

/** CLI ui_json 的 table_head 结构（仅取转化所需字段） */
interface CliTableHead {
    type?: string
    name?: string
    hash?: string
}

/** CLI ui_json 的 table_body 单个成员结构 */
interface CliTableMember {
    member_context?: string
    child_hash?: (string | null)[]
}

/** CLI ui_json 顶层结构 */
interface CliUiJson {
    table_head?: CliTableHead
    table_body?: Record<string, CliTableMember>
}

/** 卡片宽度估算常量：与 struct_mesh_leaf.svg 现有节点一致（宽度 = 内边距 + 最长文本字符数 × 字宽） */
const NODE_H_PADDING = 17
const NODE_CHAR_WIDTH = 8
/** 卡片宽度上限（px）：超长字段不再撑宽卡片，改由 StructNode.css 在卡片内换行 */
const NODE_MAX_WIDTH = 260

/**
 * 将 CLI 的 ui_json（table_head/table_body 格式）转化为画布渲染所需的节点数据。
 * title 形如 'struct config (d03e8b)'；fields 取各 members_N 的 member_context（去首尾空白）；
 * childHashes 与 fields 同序，每项为该字段全部子结构 hash 数组（无子节点则 null），用于自动连线与侧边栏展示；
 * width 按最长文本估算并封顶 NODE_MAX_WIDTH；匿名 union（name 为空）标题省略名称。解析失败返回 null。
 */
function transformUiJsonToCanvasNode(
    uiJson: string,
    fallbackHash: string
): CanvasStructNodeData | null {
    let parsed: CliUiJson
    try {
        parsed = JSON.parse(uiJson) as CliUiJson
    } catch {
        return null
    }
    const head = parsed?.table_head ?? {}
    const body = parsed?.table_body ?? {}
    const kindRaw = head.type
    const kind: CanvasStructNodeData['kind'] =
        kindRaw === 'enum' || kindRaw === 'union' ? kindRaw : 'struct'
    const name = typeof head.name === 'string' ? head.name : ''
    const hash = typeof head.hash === 'string' && head.hash !== '' ? head.hash : fallbackHash
    const hashShort = hash.slice(0, 6)
    const title = name ? `${kind} ${name} (${hashShort})` : `${kind} (${hashShort})`
    // fields 与 childHashes 同序构建：跳过空 member_context，child_hash 保留全部有效 hash
    const fields: string[] = []
    const childHashes: (string[] | null)[] = []
    for (const member of Object.values(body)) {
        const text = (member?.member_context ?? '').trim()
        if (text === '') continue
        fields.push(text)
        // 过滤 null 与空字符串，保留该字段的全部有效子结构 hash
        const validHashes = (member?.child_hash ?? []).filter(
            (h): h is string => typeof h === 'string' && h !== ''
        )
        childHashes.push(validHashes.length > 0 ? validHashes : null)
    }
    const maxLen = Math.max(title.length, ...fields.map((field) => field.length), 0)
    const width = Math.min(NODE_H_PADDING + maxLen * NODE_CHAR_WIDTH, NODE_MAX_WIDTH)
    return {
        title,
        kind,
        width,
        collapsed: false,
        fields,
        childHashes,
        parentHashes: [],
        sourceFile: null
    }
}

/**
 * 将查得的 StructRecord 列表按画布渲染格式转化（并从 relations 表补全 parentHashes）后写入红黑树，
 * 返回本次写入的节点 hash 列表（与红黑树键一致）；空数组表示无有效数据。
 * add-node / load-struct / add-node-by-hash 共用此转化写树逻辑。
 *
 * 写树同时收集所有父/子节点 hash，批量查询 DB 获取其名称并预填入 hashLabelMap 缓存，
 * 使侧边栏在这些节点尚未加载到红黑树时仍能显示可读名称而非原始 hash。
 */
function transformAndInsert(
    records: StructRecord[],
    dbPath: string,
    tag: string,
    label: string
): string[] {
    // 按画布渲染格式转化每条记录的 ui_json；{ ...record } 保留原 hash 作为红黑树键
    const transformed: StructRecord[] = []
    // 收集所有关联的父/子 hash，用于批量查询名称并预填标签缓存
    const relatedHashes = new Set<string>()
    for (const record of records) {
        if (!record.ui_json) continue
        const node = transformUiJsonToCanvasNode(record.ui_json, record.hash)
        if (!node) continue
        // 查询 relations 表获取引用当前结构体的父节点 hash 列表；表不存在时降级为空数组
        try {
            node.parentHashes = findParentHashes(dbPath, record.hash)
        } catch {
            node.parentHashes = []
        }
        // 源文件路径直接取自 structures 表记录，供侧边栏「源文件」展示
        node.sourceFile = record.source_file ?? null
        // 收集父/子 hash 以便批量查询名称
        for (const h of node.parentHashes) relatedHashes.add(h)
        for (const hArr of node.childHashes) {
            if (hArr) for (const h of hArr) relatedHashes.add(h)
        }
        transformed.push({ ...record, ui_json: JSON.stringify(node) })
    }
    if (transformed.length === 0) {
        console.warn('[Main] %s: 结构体 "%s" 无有效 ui_json 可转化', tag, label)
        return []
    }
    // 批量查询父/子节点的名称并写入标签缓存，使侧边栏在节点未加载时仍显示可读名称
    const relatedHashList = [...relatedHashes]
    if (relatedHashList.length > 0) {
        try {
            const nameRows = findStructNamesByHashes(dbPath, relatedHashList)
            const labelEntries: Array<[string, string]> = nameRows.map((row) => [
                row.hash,
                buildLabel(row.data_type_first || 'struct', row.data_type_latter || '', row.hash)
            ])
            treeInsertLabels(labelEntries)
        } catch (err) {
            console.warn('[Main] %s: 批量查询父/子节点名称失败，侧边栏可能回退显示 hash', tag, err)
        }
    }
    const inserted = treeInsert(transformed)
    console.log(
        '[Main] %s: 已写入红黑树 %d 条（本次新增 %d，树内合计 %d）',
        tag,
        transformed.length,
        inserted,
        treeGetSize()
    )
    return transformed.map((record) => record.hash)
}

/**
 * 在指定数据库中按结构体名（可选类型前缀）查找，转化后存入红黑树（以 hash 为键）。
 * 供 add-node 与 load-struct 共用；返回本次写入红黑树的节点 hash 列表，
 * 空数组表示未找到或无有效数据。查询/写入异常不在此捕获，由调用方 try-catch 处理。
 */
function loadStructIntoTree(
    structName: string,
    dataTypeFirst: string | undefined,
    dbPath: string,
    tag: string
): string[] {
    const records = findStructRecords(dbPath, structName, dataTypeFirst)
    if (records.length === 0) {
        console.log('[Main] %s: 数据库中未找到结构体 "%s"', tag, structName)
        return []
    }
    return transformAndInsert(records, dbPath, tag, structName)
}

/**
 * 在指定数据库中按 hash 精确查找，转化后存入红黑树；返回本次写入的节点 hash 列表。
 * 供侧边栏点击「显示」父/子节点时复用与导入节点相同的转化写树逻辑（仅查询键为 hash）；
 * 空数组表示未找到或无有效数据。查询/写入异常不在此捕获，由调用方 try-catch 处理。
 */
function loadStructIntoTreeByHash(hash: string, dbPath: string, tag: string): string[] {
    const records = findStructRecordsByHash(dbPath, hash)
    if (records.length === 0) {
        console.log('[Main] %s: 数据库中未找到 hash=%s', tag, hash)
        return []
    }
    return transformAndInsert(records, dbPath, tag, hash)
}

/**
 * 主进程与渲染进程通信的 IPC 通道集合。
 * 从 index.ts 提取独立维护：涵盖文件选择、项目文件处理、节点新增与结构体加载，
 * 统一由 registerIpcHandlers() 在 app.whenReady 后注册；
 * CLI 相关通道（cli:*）仍由 cli-service.ts 的 registerCliIpc() 负责，
 * 数据库读取能力由 db-service.ts 提供。
 */
/** get-app-info 通道返回结构：渲染端「帮助」页展示所需的应用元信息 */
export interface AppInfo {
    /** 应用名称（取自 package.json name，由 Electron app.getName() 读取） */
    name: string
    /** 应用版本号（取自 package.json version，由 Electron app.getVersion() 读取） */
    version: string
    /** 应用作者 */
    author: string
    /** 项目地址（GitHub 仓库链接） */
    projectUrl: string
}

/** 应用作者 */
const APP_AUTHOR = 'Garfield-2718'

/** 项目地址：GitHub 仓库链接 */
const APP_PROJECT_URL = 'https://github.com/Garfield-2718/C_Struct_Gplot'

export function registerIpcHandlers(): void {
    // IPC: 加载持久化设置（userData/settings.json）
    ipcMain.handle('load-settings', async () => {
        return loadSettings()
    })

    // IPC: 返回应用元信息（名称/版本/作者/项目地址），供渲染端「帮助」页展示
    // name/version 由 Electron 从 package.json 读取；author/projectUrl 为常量。
    ipcMain.handle('get-app-info', async (): Promise<AppInfo> => {
        return {
            name: app.getName(),
            version: app.getVersion(),
            author: APP_AUTHOR,
            projectUrl: APP_PROJECT_URL
        }
    })

    // IPC: 保存设置到配置文件
    ipcMain.handle('save-settings', async (_event, data: SettingsData) => {
        saveSettings(data)
        return true
    })

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
        const locale = getSettingsLocale()
        const result = await dialog.showOpenDialog({
            properties,
            title: translate(
                locale,
                mode === 'directory' ? 'native.selectProjectDirectory' : 'native.selectProjectFile'
            ),
            buttonLabel: translate(locale, 'native.open'),
            filters: [{ name: translate(locale, 'native.allFiles'), extensions: ['*'] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
            return null
        }
        return result.filePaths[0]
    })

    // IPC: 打开「选择已有数据库」对话框，仅用于导入已存在的 .db 文件。
    // 与 select-project-file 区分：固定为文件选择器并以 .db 为首选过滤器，
    // 取消或选空时返回 null。
    ipcMain.handle('select-db-file', async () => {
        const locale = getSettingsLocale()
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            title: translate(locale, 'native.selectDatabase'),
            buttonLabel: translate(locale, 'native.open'),
            filters: [
                { name: translate(locale, 'native.sqliteDatabase'), extensions: ['db'] },
                { name: translate(locale, 'native.allFiles'), extensions: ['*'] }
            ]
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
            return localizedFailure({ code: 'FILE_PATH_INVALID' }, { filePath })
        }
        // db 输出目录：可执行文件所在目录下 struct_list_db/
        try {
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
                // 将本次生成的数据库设为会话活动库，使画布 add-node 等通道直接查询此库
                setActiveDbPath(dbFilePath)
                return {
                    status: 'success',
                    filePath,
                    message:
                        result.stdout || translate(getSettingsLocale(), 'native.projectProcessed')
                }
            }
            return localizedFailure(
                result.error ?? {
                    code: 'CLI_FAILED',
                    params: { exitCode: result.code },
                    detail: result.stderr
                },
                { filePath }
            )
        } catch (cause) {
            return localizedFailure(
                {
                    code: 'PROJECT_PROCESS_FAILED',
                    detail: cause instanceof Error ? cause.message : String(cause)
                },
                { filePath }
            )
        }
    })

    // IPC: 接收渲染进程「导入已有数据库」传来的 .db 路径：校验其含 structures / relations
    // 两表且字段与 CLI schema 一致后，复制到应用数据库目录 struct_list_db/（与 CLI 生成库同一位置，
    // 便于统一管理且重启后仍可被 resolveDbPath 发现），并设为会话活动库供画布查询。
    // 返回 { status, message, dbPath }：status 为 success/failure，dbPath 为最终生效的库路径。
    ipcMain.handle('import-db-file', async (_event, dbPath: string) => {
        const trimmed = typeof dbPath === 'string' ? dbPath.trim() : ''
        console.log('[Main] 接收到待导入的数据库路径:', trimmed)
        if (!trimmed) {
            return localizedFailure({ code: 'DB_PATH_INVALID' }, { dbPath })
        }
        if (!existsSync(trimmed)) {
            return localizedFailure({ code: 'DB_FILE_MISSING' }, { dbPath: trimmed })
        }
        // 校验数据库结构：需含 structures / relations 两表且字段与 CLI schema 一致
        const validation = validateStructDb(trimmed)
        if (!validation.ok) {
            console.warn('[Main] import-db-file: 数据库校验未通过:', validation.message)
            return localizedFailure(validation.error, { dbPath: trimmed })
        }
        // 复制到应用数据库目录，使其与 CLI 生成库处于同一受管位置
        const dbDir = resolveDefaultDbDir()
        const targetPath = join(dbDir, basename(trimmed))
        try {
            mkdirSync(dbDir, { recursive: true })
            // 源文件已在目标位置时无需重复复制，直接沿用
            if (targetPath !== trimmed) {
                copyFileSync(trimmed, targetPath)
            }
        } catch (err) {
            console.error('[Main] import-db-file: 复制数据库失败', err)
            return localizedFailure(
                {
                    code: 'DB_COPY_FAILED',
                    detail: err instanceof Error ? err.message : String(err)
                },
                { dbPath: trimmed }
            )
        }
        setActiveDbPath(targetPath)
        console.log('[Main] 已导入并设为活动数据库:', targetPath)
        return {
            status: 'success',
            dbPath: targetPath,
            message: translate(getSettingsLocale(), 'native.databaseImported')
        }
    })

    // IPC: 接收渲染进程「添加节点」对话框传来的字符串；解析结构体标识后在当前活动数据库
    // 中查找，按画布渲染格式转化其 ui_json 并存入红黑树（以 hash 为键）。
    // 返回 { success, hashes }：success 为是否成功写入，hashes 为写入节点的 hash 列表。
    ipcMain.handle('add-node', async (_event, nodeName: string): Promise<AddNodeResult> => {
        const trimmed = typeof nodeName === 'string' ? nodeName.trim() : ''
        console.log('[Main] 接收到新增节点内容:', trimmed)
        if (!trimmed) {
            console.warn('[Main] add-node: 节点内容为空，已忽略')
            return { success: false, hashes: [] }
        }
        // 解析 "struct hapd_interfaces" → 类型 struct + 名称 hapd_interfaces
        const { dataTypeFirst, structName } = parseStructIdentity(trimmed)
        try {
            // 数据库：会话活动库 / 默认目录中的唯一 .db；无可用库时 resolveDbPath 报错，由 catch 兑底
            const dbPath = resolveDbPath()
            const hashes = loadStructIntoTree(structName, dataTypeFirst, dbPath, 'add-node')
            return { success: hashes.length > 0, hashes }
        } catch (err) {
            console.error('[Main] add-node: 处理失败', err)
            return { success: false, hashes: [] }
        }
    })

    // IPC: 按 hash 新增节点，供侧边栏点击「显示」父/子节点时复用与 add-node 相同的
    // 查库→转化→写红黑树逻辑（区别仅在按 hash 而非结构体名查询）。
    // 返回 { success, hashes }，结构与 add-node 一致，供渲染进程随后 query-node 取回并渲染。
    ipcMain.handle('add-node-by-hash', async (_event, hash: string): Promise<AddNodeResult> => {
        const key = typeof hash === 'string' ? hash.trim() : ''
        console.log('[Main] 接收到按 hash 新增节点:', key)
        if (!key) {
            console.warn('[Main] add-node-by-hash: hash 为空，已忽略')
            return { success: false, hashes: [] }
        }
        try {
            // 数据库：会话活动库 / 默认目录中的唯一 .db；无可用库时 resolveDbPath 报错，由 catch 兑底
            const dbPath = resolveDbPath()
            const hashes = loadStructIntoTreeByHash(key, dbPath, 'add-node-by-hash')
            return { success: hashes.length > 0, hashes }
        } catch (err) {
            console.error('[Main] add-node-by-hash: 处理失败', err)
            return { success: false, hashes: [] }
        }
    })

    // IPC: 接收渲染进程要加载的结构体，在数据库中查找后按画布渲染格式转化其 ui_json，
    // 存入 rbtree-service 的红黑树（以 hash 为键）；仅返回 bool 成功/失败，不回传具体数据。
    // 渲染进程可显式传 dbPath；未传时由 resolveDbPath 定位默认目录中的唯一 .db。
    ipcMain.handle('load-struct', async (_event, payload?: LoadStructPayload) => {
        const rawName = payload?.structName
        const structName = typeof rawName === 'string' ? rawName.trim() : ''
        if (!structName) {
            console.warn('[Main] load-struct: 结构体名为空，已忽略')
            return false
        }
        try {
            const dbPath = resolveDbPath(payload?.dbPath)
            const hashes = loadStructIntoTree(
                structName,
                payload?.dataTypeFirst,
                dbPath,
                'load-struct'
            )
            return hashes.length > 0
        } catch (err) {
            console.error('[Main] load-struct: 处理失败', err)
            return false
        }
    })

    // IPC: 按 hash 在红黑树中查询节点，返回其完整信息（ui_json 已是画布渲染格式）；
    // hash 为空或未找到时返回 null。供渲染进程在 add-node 成功后拉取节点信息进行渲染。
    ipcMain.handle('query-node', async (_event, hash: string) => {
        const key = typeof hash === 'string' ? hash.trim() : ''
        if (!key) {
            console.warn('[Main] query-node: hash 为空，已忽略')
            return null
        }
        const record = treeFindByHash(key)
        if (!record) {
            console.log('[Main] query-node: 红黑树中未找到 hash=%s', key)
            return null
        }
        console.log('[Main] query-node: 命中 hash=%s', key)
        return record
    })

    // IPC: 批量查询节点标题，供侧边栏将父/子节点 hash 解析为可读名称。
    // 入参为 hash 数组，返回 { hash, title } 数组。
    // 查询优先级：红黑树 ui_json 中的完整标题 → hashLabelMap 缓存的名称 → hash 本身兜底。
    ipcMain.handle('query-node-labels', async (_event, hashes: string[]) => {
        if (!Array.isArray(hashes)) return []
        return hashes.map((hash) => {
            // 优先从红黑树中读取完整 title（含 hash 后缀，与画布卡片标题一致）
            const record = treeFindByHash(hash)
            if (record?.ui_json) {
                try {
                    const data = JSON.parse(record.ui_json) as CanvasStructNodeData
                    return { hash, title: data.title }
                } catch {
                    // ui_json 解析失败，继续回退
                }
            }
            // 回退到标签缓存（节点尚未加载到红黑树，但名称已在写树时预缓存）
            const cachedLabel = treeFindLabel(hash)
            if (cachedLabel) return { hash, title: cachedLabel }
            // 最终兜底：返回 hash 本身
            return { hash, title: hash }
        })
    })

    // IPC: 将渲染进程生成的导出产物保存为本地文件。
    // 二进制产物（pdf/png/jpeg）以 base64 主体写入；文本产物（svg 标记）以 utf-8 写入。
    // 弹出原生「保存」对话框由用户选择路径与文件名，扩展名按格式补全。
    // 返回 { status }：success（带 filePath）/ canceled（用户取消）/ failure（带可翻译错误码）。
    ipcMain.handle(
        'export:save-file',
        async (_event, payload: ExportSavePayload): Promise<ExportSaveResult> => {
            const locale = getSettingsLocale()
            const format = payload?.format
            const ext = EXPORT_EXTENSIONS[format]
            // 缺格式或既无二进制主体也无文本主体：视为无效载荷，直接失败
            if (!ext || (!payload?.dataBase64 && payload?.text == null)) {
                console.warn('[Main] export:save-file: 载荷无效', {
                    format,
                    hasText: !!payload?.text
                })
                return { status: 'failure', error: { code: 'EXPORT_SAVE_FAILED' } }
            }
            const trimmedName =
                typeof payload.defaultFileName === 'string' ? payload.defaultFileName.trim() : ''
            const defaultPath = `${trimmedName || 'export'}.${ext}`
            try {
                const result = await dialog.showSaveDialog({
                    title: translate(locale, 'native.exportFile'),
                    buttonLabel: translate(locale, 'native.save'),
                    defaultPath,
                    filters: [
                        {
                            name: translate(locale, EXPORT_FILTER_NAME_KEYS[format]),
                            extensions: [ext]
                        }
                    ]
                })
                if (result.canceled || !result.filePath) {
                    return { status: 'canceled' }
                }
                if (payload.text != null) {
                    writeFileSync(result.filePath, payload.text, 'utf-8')
                } else {
                    writeFileSync(
                        result.filePath,
                        Buffer.from(payload.dataBase64 as string, 'base64')
                    )
                }
                console.log('[Main] 已导出 %s 文件:', format, result.filePath)
                return { status: 'success', filePath: result.filePath }
            } catch (err) {
                console.error('[Main] export:save-file: 写入失败', err)
                return {
                    status: 'failure',
                    error: {
                        code: 'EXPORT_SAVE_FAILED',
                        detail: err instanceof Error ? err.message : String(err)
                    }
                }
            }
        }
    )
}
