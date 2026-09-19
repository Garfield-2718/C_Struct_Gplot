import type { MessageKey, TranslationParams } from './locales/types'

/** 稳定业务错误码；UI 只翻译映射键，不能把系统异常文本当作翻译键。 */
export const ERROR_MESSAGE_KEYS = {
    UNKNOWN: 'errors.unknown',
    SETTINGS_LOAD_FAILED: 'errors.settingsLoadFailed',
    SETTINGS_SAVE_FAILED: 'errors.settingsSaveFailed',
    FILE_PATH_INVALID: 'errors.filePathInvalid',
    DB_PATH_INVALID: 'errors.dbPathInvalid',
    DB_FILE_MISSING: 'errors.dbFileMissing',
    DB_INVALID: 'errors.dbInvalid',
    DB_OPEN_FAILED: 'errors.dbOpenFailed',
    DB_TABLE_MISSING: 'errors.dbTableMissing',
    DB_COLUMNS_MISSING: 'errors.dbColumnsMissing',
    DB_VALIDATION_FAILED: 'errors.dbValidationFailed',
    DB_COPY_FAILED: 'errors.dbCopyFailed',
    DB_IMPORT_FAILED: 'errors.dbImportFailed',
    PROJECT_PROCESS_FAILED: 'errors.projectProcessFailed',
    CLI_FAILED: 'errors.cliFailed',
    CLI_TIMEOUT: 'errors.cliTimeout',
    NODE_NOT_FOUND: 'errors.nodeNotFound',
    NODE_LOAD_FAILED: 'errors.nodeLoadFailed',
    EXPORT_SAVE_FAILED: 'errors.exportSaveFailed'
} as const satisfies Record<string, MessageKey>

export type AppErrorCode = keyof typeof ERROR_MESSAGE_KEYS

/**
 * 可结构化克隆的错误数据，不传 Error 实例。
 * params 只放字符串/数字；CLI_FAILED 需要 exitCode（无退出码时可传 'null'）。
 * detail 是可选的原始诊断文本，不翻译，不用作用户界面的主提示。
 */
export interface AppError {
    code: AppErrorCode
    params?: TranslationParams
    detail?: string
}

export function errorMessageKey(code: unknown): (typeof ERROR_MESSAGE_KEYS)[AppErrorCode] {
    return typeof code === 'string' && Object.hasOwn(ERROR_MESSAGE_KEYS, code)
        ? ERROR_MESSAGE_KEYS[code as AppErrorCode]
        : ERROR_MESSAGE_KEYS.UNKNOWN
}

/** 保留现有顶层路径与 message，message 仅供旧调用方兼容，不解析其中的语言。 */
export interface IpcResultContext {
    filePath?: string
    dbPath?: string
    message?: string
}

export interface IpcSuccess extends IpcResultContext {
    status: 'success'
}

/** 新迁移的业务失败返回此结构；status/filePath/dbPath 不移动到 error 内部。 */
export interface IpcFailure extends IpcResultContext {
    status: 'failure'
    error: AppError
}

export type IpcOperationResult = IpcSuccess | IpcFailure

/** 消费方迁移期兼容没有 error 字段的旧 failure；缺码显示本地化通用提示。 */
export type CompatibleIpcOperationResult =
    IpcOperationResult | (IpcResultContext & { status: 'failure'; error?: never })

export type ProcessProjectResult = CompatibleIpcOperationResult
export type ImportDbResult = CompatibleIpcOperationResult

export function createIpcFailure(error: AppError, context: IpcResultContext = {}): IpcFailure {
    return { ...context, status: 'failure', error }
}

/**
 * load-settings 仍无参数，返回完整设置或 null；save-settings 仍接收完整设置，
 * 成功返回 true，异常 reject，不套用 IpcOperationResult，也不依赖 Error 自定义字段跨 IPC。
 * 渲染端将保存 reject/非 true 响应映射为 SETTINGS_SAVE_FAILED，并保留草稿与已应用状态。
 */
export const SETTINGS_SAVE_ERROR_CODE: AppErrorCode = 'SETTINGS_SAVE_FAILED'
