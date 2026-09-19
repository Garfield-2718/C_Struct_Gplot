import { ref } from 'vue'
import type { Ref } from 'vue'
import type { ExportArtifacts } from '../canvas_view/captureCanvas'

/**
 * 导出产物单例：桥接「画布页捕获」与「导出页保存」两个不同路由。
 * 顶栏「导出」按键在画布 DOM 存活时生成产物并写入此处，随后跳转 /export；
 * 导出页读取该产物按所选格式落盘，离开时清空以释放内存（位图 data-url 可能达数 MB）。
 */
const artifacts = ref<ExportArtifacts | null>(null)

/** 写入本次导出产物；传 null 表示画布为空或生成失败 */
export function setExportArtifacts(value: ExportArtifacts | null): void {
    artifacts.value = value
}

/** 清空产物，释放内存 */
export function clearExportArtifacts(): void {
    artifacts.value = null
}

/** 读取响应式产物引用，供导出页判断是否有可导出内容 */
export function useExportArtifacts(): Ref<ExportArtifacts | null> {
    return artifacts
}
