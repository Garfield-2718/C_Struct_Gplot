import { app, ipcMain, dialog } from 'electron'
import { join, basename, extname, dirname } from 'path'
import { mkdirSync } from 'fs'
import { spawnCli } from './cli-service'
import {
        findStructRecords,
        findStructRecordsByHash,
        resolveDbPath,
        findParentHashes
} from './db-service'
import type { StructRecord } from './db-service'
import { treeInsert, treeGetSize, treeFindByHash } from './rbtree-service'

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
        /** 与 fields 同序：每个字段指向的子结构体 hash（无则为 null），用于自动连线 */
        childHashes: (string | null)[]
        /** 引用当前结构体的父结构体 hash 列表（来自 relations 表），用于侧边栏展示 */
        parentHashes: string[]
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
 * childHashes 与 fields 同序记录各字段子结构 hash（用于自动连线）；width 按最长文本估算并封顶
 * NODE_MAX_WIDTH；匿名 union（name 为空）标题省略名称。解析失败返回 null。
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
        // fields 与 childHashes 同序构建：跳过空 member_context，child_hash 取首个非空 hash
        const fields: string[] = []
        const childHashes: (string | null)[] = []
        for (const member of Object.values(body)) {
                const text = (member?.member_context ?? '').trim()
                if (text === '') continue
                fields.push(text)
                const child = member?.child_hash?.[0]
                childHashes.push(typeof child === 'string' && child !== '' ? child : null)
        }
        const maxLen = Math.max(title.length, ...fields.map((field) => field.length), 0)
        const width = Math.min(NODE_H_PADDING + maxLen * NODE_CHAR_WIDTH, NODE_MAX_WIDTH)
        return { title, kind, width, collapsed: false, fields, childHashes, parentHashes: [] }
}

/**
 * 将查得的 StructRecord 列表按画布渲染格式转化（并从 relations 表补全 parentHashes）后写入红黑树，
 * 返回本次写入的节点 hash 列表（与红黑树键一致）；空数组表示无有效数据。
 * add-node / load-struct / add-node-by-hash 共用此转化写树逻辑。
 */
function transformAndInsert(
        records: StructRecord[],
        dbPath: string,
        tag: string,
        label: string
): string[] {
        // 按画布渲染格式转化每条记录的 ui_json；{ ...record } 保留原 hash 作为红黑树键
        const transformed: StructRecord[] = []
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
                transformed.push({ ...record, ui_json: JSON.stringify(node) })
        }
        if (transformed.length === 0) {
                console.warn('[Main] %s: 结构体 "%s" 无有效 ui_json 可转化', tag, label)
                return []
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
export function registerIpcHandlers(): void {
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

        // IPC: 接收渲染进程「添加节点」对话框传来的字符串；解析结构体标识后在 db/hostapd.db
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
                // 数据库：项目 db/hostapd.db（开发态 app.getAppPath() 即项目根）
                const dbPath = join(app.getAppPath(), 'db', 'hostapd.db')
                try {
                        const hashes = loadStructIntoTree(
                                structName,
                                dataTypeFirst,
                                dbPath,
                                'add-node'
                        )
                        return { success: hashes.length > 0, hashes }
                } catch (err) {
                        console.error('[Main] add-node: 处理失败', err)
                        return { success: false, hashes: [] }
                }
        })

        // IPC: 按 hash 新增节点，供侧边栏点击「显示」父/子节点时复用与 add-node 相同的
        // 查库→转化→写红黑树逻辑（区别仅在按 hash 而非结构体名查询）。
        // 返回 { success, hashes }，结构与 add-node 一致，供渲染进程随后 query-node 取回并渲染。
        ipcMain.handle(
                'add-node-by-hash',
                async (_event, hash: string): Promise<AddNodeResult> => {
                        const key = typeof hash === 'string' ? hash.trim() : ''
                        console.log('[Main] 接收到按 hash 新增节点:', key)
                        if (!key) {
                                console.warn('[Main] add-node-by-hash: hash 为空，已忽略')
                                return { success: false, hashes: [] }
                        }
                        const dbPath = join(app.getAppPath(), 'db', 'hostapd.db')
                        try {
                                const hashes = loadStructIntoTreeByHash(
                                        key,
                                        dbPath,
                                        'add-node-by-hash'
                                )
                                return { success: hashes.length > 0, hashes }
                        } catch (err) {
                                console.error('[Main] add-node-by-hash: 处理失败', err)
                                return { success: false, hashes: [] }
                        }
                }
        )

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
        // 入参为 hash 数组，返回 { hash, title } 数组；红黑树中未命中的 hash 以自身作为 title 兜底。
        ipcMain.handle('query-node-labels', async (_event, hashes: string[]) => {
                if (!Array.isArray(hashes)) return []
                return hashes.map((hash) => {
                        const record = treeFindByHash(hash)
                        if (!record?.ui_json) return { hash, title: hash }
                        try {
                                const data = JSON.parse(record.ui_json) as CanvasStructNodeData
                                return { hash, title: data.title }
                        } catch {
                                return { hash, title: hash }
                        }
                })
        })
}
