import { computed, onUnmounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useExportArtifacts, clearExportArtifacts } from './exportStore'
import { buildExportPayloadData } from '../canvas_view/captureCanvas'
import type { ExportFormat, ExportSavePayload, ExportSaveResult } from '../../../../shared/export'
import { errorMessageKey } from '../../../../shared/errors'
import type { AppErrorCode } from '../../../../shared/errors'
import type { MessageKey, TranslationParams } from '../../../../shared/locales/types'

/** 格式单选项元数据：驱动 UI 循环渲染，翻译键在模板求值以响应语言切换 */
export interface ExportFormatOption {
    value: ExportFormat
    label: MessageKey
    hint: MessageKey
}

/** 四种导出格式，顺序即界面展示顺序 */
export const EXPORT_FORMAT_OPTIONS: readonly ExportFormatOption[] = Object.freeze([
    { value: 'pdf', label: 'export.formatPdf', hint: 'export.formatPdfHint' },
    { value: 'png', label: 'export.formatPng', hint: 'export.formatPngHint' },
    { value: 'svg', label: 'export.formatSvg', hint: 'export.formatSvgHint' },
    { value: 'jpeg', label: 'export.formatJpeg', hint: 'export.formatJpegHint' }
])

/** 默认文件名（不含扩展名）：主进程按格式补全 */
const DEFAULT_FILE_NAME = 'struct-topology'

/** useExportView 的返回结构 */
export interface ExportViewApi {
    t: (key: MessageKey, params?: TranslationParams) => string
    /** 是否存在可导出内容（画布捕获成功） */
    hasContent: ComputedRef<boolean>
    /** 图形 CSS 像素尺寸文本，供界面展示；无内容时为空串 */
    dimensionText: ComputedRef<string>
    formatOptions: readonly ExportFormatOption[]
    selectedFormat: Ref<ExportFormat>
    fileName: Ref<string>
    isSaving: ComputedRef<boolean>
    successMessage: ComputedRef<string>
    errorMessage: ComputedRef<string>
    handleSave: () => Promise<void>
    handleBack: () => void
}

/**
 * 导出页的组合式函数：
 * - 从 exportStore 读取画布页预生成的多格式产物；
 * - 用户选择格式与文件名后，经 IPC 交主进程弹出保存对话框并落盘；
 * - 无产物时展示空态；离开页面清空产物释放内存。
 */
export function useExportView(): ExportViewApi {
    const router = useRouter()
    const { t } = useI18n({ useScope: 'global' })
    const artifacts = useExportArtifacts()

    const hasContent = computed(() => artifacts.value !== null)
    const dimensionText = computed(() =>
        artifacts.value ? `${artifacts.value.width} × ${artifacts.value.height} px` : ''
    )

    const selectedFormat = ref<ExportFormat>('png')
    const fileName = ref(DEFAULT_FILE_NAME)
    const savingFlag = ref(false)
    const isSaving = computed(() => savingFlag.value)

    const savedPath = ref('')
    const successMessage = computed(() =>
        savedPath.value ? t('export.success', { path: savedPath.value }) : ''
    )

    const errorCode = ref<AppErrorCode | null>(null)
    const errorParams = ref<TranslationParams>({})
    const errorMessage = computed(() =>
        errorCode.value ? t(errorMessageKey(errorCode.value), errorParams.value) : ''
    )

    /**
     * 按所选格式取出对应产物、组装载荷，交主进程保存。
     * 产物为延迟生成：svg 直接解码中间文本；pdf/png/jpeg 在此刻才光栅化并编码所选格式。
     * 用户取消（canceled）不提示；失败映射为可翻译错误码。
     */
    async function handleSave(): Promise<void> {
        const arts = artifacts.value
        if (!arts || savingFlag.value) return
        savingFlag.value = true
        savedPath.value = ''
        errorCode.value = null
        try {
            const format = selectedFormat.value
            const payload: ExportSavePayload = {
                format,
                defaultFileName: fileName.value.trim() || DEFAULT_FILE_NAME
            }
            const data = await buildExportPayloadData(arts, format)
            if (data.text !== undefined) {
                payload.text = data.text
            } else {
                payload.dataBase64 = data.dataBase64
            }
            const result = (await window.electron.ipcRenderer.invoke(
                'export:save-file',
                payload
            )) as ExportSaveResult | undefined
            if (result?.status === 'success') {
                savedPath.value = result.filePath
            } else if (result?.status === 'failure') {
                errorCode.value = result.error?.code ?? 'EXPORT_SAVE_FAILED'
                errorParams.value = result.error?.params ?? {}
            }
            // canceled：用户主动取消，无需提示
        } catch (err) {
            errorCode.value = 'EXPORT_SAVE_FAILED'
            errorParams.value = {}
            console.error('[export] 导出失败:', err)
        } finally {
            savingFlag.value = false
        }
    }

    /** 返回画布：优先浏览器历史，无历史时回退到 /canvas */
    function handleBack(): void {
        if (window.history.length > 1) {
            router.back()
        } else {
            router.replace('/canvas')
        }
    }

    // 离开导出页即清空产物，释放位图 data-url 占用的内存
    onUnmounted(() => clearExportArtifacts())

    return {
        t,
        hasContent,
        dimensionText,
        formatOptions: EXPORT_FORMAT_OPTIONS,
        selectedFormat,
        fileName,
        isSaving,
        successMessage,
        errorMessage,
        handleSave,
        handleBack
    }
}
