import type { AppError } from './errors'

/** 支持的导出格式：与导出页单选项、主进程保存过滤器一一对应 */
export type ExportFormat = 'pdf' | 'png' | 'svg' | 'jpeg'

/** 各格式对应的文件扩展名（jpeg 落盘为 .jpg） */
export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
    pdf: 'pdf',
    png: 'png',
    svg: 'svg',
    jpeg: 'jpg'
}

/**
 * 渲染进程 → 主进程的导出保存载荷。
 * 二进制产物（pdf/png/jpeg）以 base64 主体传入 dataBase64（不含 data-url 前缀）；
 * 文本产物（svg 标记）以 utf-8 字符串传入 text。二者按格式二选一。
 */
export interface ExportSavePayload {
    format: ExportFormat
    /** 不含扩展名的默认文件名，主进程按格式自动补全 */
    defaultFileName: string
    dataBase64?: string
    text?: string
}

/** 主进程保存结果：成功回传落盘路径；取消不带路径；失败携带可翻译的业务错误码 */
export type ExportSaveResult =
    | { status: 'success'; filePath: string }
    | { status: 'canceled' }
    | { status: 'failure'; error: AppError }
