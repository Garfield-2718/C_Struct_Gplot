import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { errorMessageKey } from '../shared/errors'
import type { AppError } from '../shared/errors'
import { translate } from '../shared/locales/translate'
import { getSettingsLocale } from './settings-service'

/**
 * 主进程读取 C_Struct_Gplot_CLI（init 模式）生成的 SQLite 数据库的模块。
 * 采用 Node 22 内置的 node:sqlite（DatabaseSync），零第三方依赖、无需原生编译；
 * 以只读方式打开，按结构体名查询并取出 ui_json 字段供上层调试打印。
 */

/**
 * structures 表中一条结构体记录的调试所需字段。
 * 字段与 CLI（C_Struct_Gplot_CLI）sqlit3_api.py 定义的 structures 表一致：
 * data_type_first=复合类型前半(struct/union/enum)、data_type_latter=复合类型后半(结构体名)、
 * hash=content+salt 的 md5 唯一标识、ui_json=UI 渲染所需 JSON 字符串。
 */
export interface StructRecord {
    id: number
    hash: string
    data_type_first: string
    data_type_latter: string
    source_file: string | null
    ui_json: string | null
}

/**
 * 解析 CLI（init 模式）生成数据库的默认目录。
 * 与 ipc-handlers.ts 的 process-project-file 保持一致：
 * 打包后为可执行文件同级的 struct_list_db/，开发态为项目根下的 struct_list_db/。
 */
export function resolveDefaultDbDir(): string {
    const appDir = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
    return join(appDir, 'struct_list_db')
}

/**
 * 会话级「当前活动数据库」路径：由「导入项目」（CLI 生成后）或「导入已有 .db」设置。
 * 各查询通道统一通过 resolveDbPath() 解析，未显式传参时优先采用此路径，
 * 从而在默认目录存在多个 .db 时仍能确定目标；进程重启后失效（内存态）。
 */
let activeDbPath: string | null = null

/** 设置会话级当前活动数据库路径（导入项目 / 导入已有 .db 成功后调用） */
export function setActiveDbPath(dbPath: string): void {
    activeDbPath = dbPath
}

/** 读取会话级当前活动数据库路径；未设置时返回 null */
export function getActiveDbPath(): string | null {
    return activeDbPath
}

/** 数据库结构校验结果：ok 为是否通过，message 为通过/未通过的具体说明 */
export type DbValidationResult =
    { ok: true; message: string } | { ok: false; message: string; error: AppError }

function validationFailure(error: AppError): DbValidationResult {
    return {
        ok: false,
        error,
        message: translate(getSettingsLocale(), errorMessageKey(error.code), error.params)
    }
}

/**
 * structures 表必需字段，与 CLI（C_Struct_Gplot_CLI）sqlit3_api.py 的
 * Structures.TABLE_COLUMNS 保持一致；校验时要求全部存在（允许额外字段）。
 */
const STRUCTURES_REQUIRED_COLUMNS = [
    'id',
    'salt',
    'hash',
    'data_type_first',
    'data_type_latter',
    'typedef_names',
    'content',
    'ui_json',
    'source_file',
    'parent_num',
    'child_num'
] as const

/**
 * relations 表必需字段，与 CLI sqlit3_api.py 的 Relations.TABLE_COLUMNS 保持一致；
 * 校验时要求全部存在（允许额外字段）。
 */
const RELATIONS_REQUIRED_COLUMNS = ['id', 'parent', 'child'] as const

/**
 * 读取指定表的字段名列表：通过 PRAGMA table_info 获取，表不存在时返回空数组。
 * table 仅由内部常量传入（structures/relations），不存在 SQL 注入风险。
 */
function readTableColumns(db: DatabaseSync, table: string): string[] {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return rows.map((row) => row.name)
}

/**
 * 校验指定文件是否为本工具可用的结构体数据库：以只读方式打开，依次确认
 * structures 与 relations 两表均存在且包含全部必需字段（与 CLI 生成的 schema 对齐）。
 * 返回 DbValidationResult：任一环节不满足时 ok=false 并在 message 中给出具体原因，
 * 供「导入已有 .db」在接受文件前做合法性校验并向用户反馈。
 */
export function validateStructDb(dbPath: string): DbValidationResult {
    let db: DatabaseSync
    try {
        db = new DatabaseSync(dbPath, { readOnly: true })
    } catch (err) {
        return validationFailure({
            code: 'DB_OPEN_FAILED',
            detail: err instanceof Error ? err.message : String(err)
        })
    }
    try {
        // 逐表校验：表必须存在（PRAGMA 返回非空）且包含全部必需字段
        const checks: Array<[string, readonly string[]]> = [
            ['structures', STRUCTURES_REQUIRED_COLUMNS],
            ['relations', RELATIONS_REQUIRED_COLUMNS]
        ]
        for (const [table, required] of checks) {
            const actual = readTableColumns(db, table)
            if (actual.length === 0) {
                return validationFailure({ code: 'DB_TABLE_MISSING', params: { table } })
            }
            const actualSet = new Set(actual)
            const missing = required.filter((column) => !actualSet.has(column))
            if (missing.length > 0) {
                return validationFailure({
                    code: 'DB_COLUMNS_MISSING',
                    params: { table, columns: missing.join(', ') }
                })
            }
        }
        return { ok: true, message: translate(getSettingsLocale(), 'native.databaseValidated') }
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        // SQLite 打开为惰性：非数据库文件直到首次查询才报错，此处归一为更清晰的提示
        if ((err as { errcode?: number } | null)?.errcode === 26) {
            return validationFailure({ code: 'DB_INVALID', detail: reason })
        }
        return validationFailure({ code: 'DB_VALIDATION_FAILED', detail: reason })
    } finally {
        db.close()
    }
}

/**
 * 定位待查询的数据库文件：显式传入的 explicitPath 优先；其次是会话级活动库
 * （导入项目 / 导入已有 .db 后设置）；最后在默认目录中查找唯一的 .db 文件。
 * 目录缺失、无 .db 或存在多个 .db（无法确定目标）时抛出带诊断信息的错误，交由调用方处理。
 */
export function resolveDbPath(explicitPath?: string): string {
    const explicit = typeof explicitPath === 'string' ? explicitPath.trim() : ''
    if (explicit) {
        if (!existsSync(explicit)) {
            throw new Error(`数据库文件不存在: ${explicit}`)
        }
        return explicit
    }
    // 会话内已设置活动数据库（导入项目 / 导入已有 .db）时优先采用，
    // 避免默认目录存在多个 .db 时无法确定目标
    if (activeDbPath && existsSync(activeDbPath)) {
        return activeDbPath
    }
    const dir = resolveDefaultDbDir()
    if (!existsSync(dir)) {
        throw new Error(`数据库目录不存在: ${dir}（请先在导入页解析项目以生成数据库）`)
    }
    const dbFiles = readdirSync(dir).filter((name) => name.endsWith('.db'))
    if (dbFiles.length === 0) {
        throw new Error(`数据库目录中没有 .db 文件: ${dir}`)
    }
    if (dbFiles.length > 1) {
        throw new Error(`数据库目录存在多个 .db 文件，请显式指定 dbPath：${dbFiles.join(', ')}`)
    }
    return join(dir, dbFiles[0])
}

/**
 * 在指定 SQLite 数据库中按结构体名查找记录（含 ui_json）。
 * 采用与 CLI sqlit3_api.py 相同的 COLLATE BINARY 区分大小写精确匹配；
 * 传入 dataTypeFirst（struct/union/enum）时进一步按类型精确匹配。
 * 以只读方式打开，查询后立即关闭连接；同名结构体可能命中多行，故返回数组。
 */
export function findStructRecords(
    dbPath: string,
    structName: string,
    dataTypeFirst?: string
): StructRecord[] {
    const typeFilter = typeof dataTypeFirst === 'string' ? dataTypeFirst.trim() : ''
    const columns = 'id, hash, data_type_first, data_type_latter, source_file, ui_json'
    const byLatter = 'data_type_latter = ? COLLATE BINARY'
    let sql = `SELECT ${columns} FROM structures WHERE ${byLatter}`
    if (typeFilter !== '') {
        sql += ' AND data_type_first = ? COLLATE BINARY'
    }

    // readOnly 打开，避免误写 CLI 生成的数据库
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        const params = typeFilter !== '' ? [structName, typeFilter] : [structName]
        const rows = db.prepare(sql).all(...params)
        return rows as unknown as StructRecord[]
    } finally {
        db.close()
    }
}

/**
 * 在指定 SQLite 数据库中按 hash 精确查找结构体记录（含 ui_json）。
 * hash 为 content+salt 的 md5 唯一标识，正常至多命中一行；为与 findStructRecords 接口一致仍返回数组。
 * 供侧边栏「显示父/子节点」按已知 hash 复用与导入节点相同的查库→转化→写红黑树流程。
 * 采用 COLLATE BINARY 区分大小写精确匹配；以只读方式打开，查询后立即关闭连接。
 */
export function findStructRecordsByHash(dbPath: string, hash: string): StructRecord[] {
    const columns = 'id, hash, data_type_first, data_type_latter, source_file, ui_json'
    const sql = `SELECT ${columns} FROM structures WHERE hash = ? COLLATE BINARY`
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        const rows = db.prepare(sql).all(hash)
        return rows as unknown as StructRecord[]
    } finally {
        db.close()
    }
}

/**
 * 在指定数据库中查询 relations 表，返回引用了指定 child hash 的所有 parent hash。
 * relations 表由 CLI init 模式生成，记录结构体间的父子引用关系（parent→child）；
 * CLI 按父结构体的字段数逐行 INSERT，同一 (parent, child) 对可能占多行，
 * 故查询用 SELECT DISTINCT 在源头去重，避免侧边栏父节点列表出现重复项。
 * 以只读方式打开，查询后立即关闭连接；relations 表不存在时抛出异常，由调用方处理。
 */
export function findParentHashes(dbPath: string, childHash: string): string[] {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        const rows = db
            .prepare('SELECT DISTINCT parent FROM relations WHERE child = ?')
            .all(childHash)
        return (rows as Array<{ parent: string }>).map((r) => r.parent)
    } finally {
        db.close()
    }
}

/**
 * 在指定数据库中查询 relations 表，返回指定 parent hash 引用的所有 child hash。
 * 与 findParentHashes 同理：CLI 按字段数逐行 INSERT，同一 (parent, child) 对可能占多行，
 * 用 SELECT DISTINCT 在源头去重，避免下游消费方拿到重复项。
 * 以只读方式打开，查询后立即关闭连接；relations 表不存在时抛出异常，由调用方处理。
 */
export function findChildHashes(dbPath: string, parentHash: string): string[] {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        const rows = db
            .prepare('SELECT DISTINCT child FROM relations WHERE parent = ?')
            .all(parentHash)
        return (rows as Array<{ child: string }>).map((r) => r.child)
    } finally {
        db.close()
    }
}

/**
 * 在指定 SQLite 数据库中按 hash 批量查找结构体的类型与名称（不含 ui_json，轻量查询）。
 * 返回数组，每条含 hash、data_type_first、data_type_latter；未命中的 hash 不在结果中。
 * 供红黑树插入节点时同步缓存其父/子节点的显示名称，避免侧边栏回退显示原始 hash。
 * 以只读方式打开，查询后立即关闭连接。
 */
export function findStructNamesByHashes(
    dbPath: string,
    hashes: string[]
): Array<{ hash: string; data_type_first: string; data_type_latter: string }> {
    if (hashes.length === 0) return []
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
        const placeholders = hashes.map(() => '?').join(',')
        const sql = `SELECT hash, data_type_first, data_type_latter FROM structures WHERE hash IN (${placeholders})`
        const rows = db.prepare(sql).all(...hashes)
        return rows as Array<{ hash: string; data_type_first: string; data_type_latter: string }>
    } finally {
        db.close()
    }
}
