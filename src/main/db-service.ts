import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'

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
 * 定位待查询的数据库文件：显式传入的 explicitPath 优先；
 * 否则在默认目录中查找唯一的 .db 文件。目录缺失、无 .db 或存在多个 .db
 * （无法确定目标）时抛出带诊断信息的错误，交由调用方处理。
 */
export function resolveDbPath(explicitPath?: string): string {
        const explicit = typeof explicitPath === 'string' ? explicitPath.trim() : ''
        if (explicit) {
                if (!existsSync(explicit)) {
                        throw new Error(`数据库文件不存在: ${explicit}`)
                }
                return explicit
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
                throw new Error(
                        `数据库目录存在多个 .db 文件，请显式指定 dbPath：${dbFiles.join(', ')}`
                )
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
 * relations 表由 CLI init 模式生成，记录结构体间的父子引用关系（parent→child）。
 * 以只读方式打开，查询后立即关闭连接；relations 表不存在时抛出异常，由调用方处理。
 */
export function findParentHashes(dbPath: string, childHash: string): string[] {
        const db = new DatabaseSync(dbPath, { readOnly: true })
        try {
                const rows = db.prepare('SELECT parent FROM relations WHERE child = ?').all(childHash)
                return (rows as Array<{ parent: string }>).map((r) => r.parent)
        } finally {
                db.close()
        }
}

/**
 * 在指定数据库中查询 relations 表，返回指定 parent hash 引用的所有 child hash。
 * 以只读方式打开，查询后立即关闭连接；relations 表不存在时抛出异常，由调用方处理。
 */
export function findChildHashes(dbPath: string, parentHash: string): string[] {
        const db = new DatabaseSync(dbPath, { readOnly: true })
        try {
                const rows = db.prepare('SELECT child FROM relations WHERE parent = ?').all(parentHash)
                return (rows as Array<{ child: string }>).map((r) => r.child)
        } finally {
                db.close()
        }
}
