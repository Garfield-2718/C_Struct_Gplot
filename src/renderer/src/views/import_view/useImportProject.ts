import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { errorMessageKey } from '../../../../shared/errors'
import type { AppError, ImportDbResult, ProcessProjectResult } from '../../../../shared/errors'

const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

/** import-db-file 通道返回结构，与主进程 ipc-handlers.ts 对齐 */
type ImportFailure = AppError

/** 导入项目页的组合式函数：画布自适应缩放 + 文件选择/拖入 */
export function useImportProject() {
    const canvasWrapper = ref<HTMLElement | null>(null)
    const scale = ref(1)
    const isDragOver = ref(false)
    let lastDropTime = 0
    let observer: ResizeObserver | null = null
    const router = useRouter()
    const { t } = useI18n({ useScope: 'global' })

    /**
     * 选择文件/文件夹的二级菜单：页面上只保留一个选择器，
     * 点击后展开菜单再分流到「选择文件」或「选择文件夹」的原生对话框，
     * 以规避 Windows/Linux 原生对话框无法同时充当文件与目录选择器的限制。
     */
    const pickerMenuOpen = ref(false)

    /** 点击选择器时切换二级菜单的展开状态 */
    function togglePickerMenu(): void {
        // 拖拽松手后短时间内忽略 click，避免重复触发
        if (Date.now() - lastDropTime < 500) return
        pickerMenuOpen.value = !pickerMenuOpen.value
    }

    /** 关闭二级菜单 */
    function closePickerMenu(): void {
        pickerMenuOpen.value = false
    }

    /** 点击选择器区域之外时关闭二级菜单 */
    function handleDocumentPointerDown(event: PointerEvent): void {
        if (!pickerMenuOpen.value) return
        const target = event.target as HTMLElement | null
        if (!target?.closest('.imv-picker-wrap')) closePickerMenu()
    }

    /** 按 Esc 关闭二级菜单 */
    function handleDocumentKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') closePickerMenu()
    }

    /** 错误提示弹窗状态：校验/导入失败时展示具体原因 */
    const errorVisible = ref(false)
    const error = ref<ImportFailure | null>(null)
    const errorTitle = computed(() => t('import.databaseFailed'))
    const errorMessage = computed(() =>
        error.value ? t(errorMessageKey(error.value.code), error.value.params ?? {}) : ''
    )
    const errorDetail = computed(() => error.value?.detail ?? '')

    /** 弹出错误提示：记录标题与详情并显示弹窗 */
    function showError(failure: AppError): void {
        error.value = failure
        errorVisible.value = true
    }

    /** 关闭错误提示弹窗 */
    function handleDismissError(): void {
        errorVisible.value = false
    }

    function updateScale(): void {
        if (!canvasWrapper.value) return
        const w = canvasWrapper.value.clientWidth
        const h = canvasWrapper.value.clientHeight
        scale.value = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT)
    }

    onMounted(() => {
        updateScale()
        if (canvasWrapper.value) {
            observer = new ResizeObserver(updateScale)
            observer.observe(canvasWrapper.value)
        }
        document.addEventListener('pointerdown', handleDocumentPointerDown)
        document.addEventListener('keydown', handleDocumentKeydown)
    })

    onUnmounted(() => {
        observer?.disconnect()
        document.removeEventListener('pointerdown', handleDocumentPointerDown)
        document.removeEventListener('keydown', handleDocumentKeydown)
    })

    /**
     * 选择项目文件/目录并交由主进程解析。
     * mode 为 'file'（选择单个文件）或 'directory'（选择文件夹）。
     * 先把路径交给主进程处理（不阻塞），随后立即进入 loading 页面等待结果；
     * 成功进入 canvas 页面，CLI 超时跳转专用超时页，其它失败返回导入页。
     */
    async function runProjectImport(mode: 'file' | 'directory'): Promise<void> {
        // 选定菜单项后先收起二级菜单
        closePickerMenu()
        // 拖拽松手后短时间内忽略 click 事件，避免重复触发
        if (Date.now() - lastDropTime < 500) return
        const filePath = await window.electron.ipcRenderer.invoke('select-project-file', mode)
        if (!filePath) {
            console.log('[ProjectSelect] Cancelled')
            return
        }
        console.log('[ProjectSelect] Selected:', filePath)

        const processing = window.electron.ipcRenderer.invoke('process-project-file', filePath)
        router.push('/loading')

        const result = (await processing) as ProcessProjectResult | undefined
        if (result?.status === 'success') {
            router.replace('/canvas')
        } else if (result?.status === 'failure' && result.error?.code === 'CLI_TIMEOUT') {
            // 超时属于需要向用户明确提示的可恢复错误：携带时长、诊断详情与原文件路径
            // 跳转 /timeout，该页「重试」按键可直接复用 filePath 再次发起处理
            console.error('[ProjectSelect] CLI 解析超时:', result.error)
            const timeout = result.error.params?.timeout
            router.replace({
                path: '/timeout',
                query: {
                    ...(typeof timeout === 'number' || typeof timeout === 'string'
                        ? { timeout: String(timeout) }
                        : {}),
                    ...(result.error.detail ? { detail: result.error.detail } : {}),
                    filePath
                }
            })
        } else {
            console.error('[ProjectSelect] 主进程处理失败:', result?.message)
            router.replace('/')
        }
    }

    /** 选择单个项目文件并解析 */
    async function handleSelectFile(): Promise<void> {
        await runProjectImport('file')
    }

    /** 选择项目文件夹并解析 */
    async function handleSelectDirectory(): Promise<void> {
        await runProjectImport('directory')
    }

    /**
     * 导入已有数据库：打开 .db 文件选择对话框，选中后交由主进程校验并设为活动库。
     * 成功则直接进入画布页（无需 CLI 解析，故不经过 loading 页），失败则留在本页并打印原因。
     */
    async function handleSelectDb(): Promise<void> {
        try {
            const dbPath = await window.electron.ipcRenderer.invoke('select-db-file')
            if (!dbPath) {
                console.log('[DbSelect] Cancelled')
                return
            }
            console.log('[DbSelect] Selected:', dbPath)
            const result = (await window.electron.ipcRenderer.invoke('import-db-file', dbPath)) as
                ImportDbResult | undefined
            if (result?.status === 'success') {
                console.log('[DbSelect] 导入成功，活动数据库:', result.dbPath)
                router.push('/canvas')
            } else {
                console.error('[DbSelect] 导入失败:', result)
                showError(
                    result?.error ?? {
                        code: 'DB_IMPORT_FAILED',
                        detail: result?.message
                    }
                )
            }
        } catch (cause) {
            showError({
                code: 'DB_IMPORT_FAILED',
                detail: cause instanceof Error ? cause.message : String(cause)
            })
        }
    }

    function handleDrop(event: DragEvent): void {
        isDragOver.value = false
        lastDropTime = Date.now()
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) {
            console.warn('[FileDrop] 未接收到文件，WSL2 环境下拖拽可能不受支持，请使用点击选择')
            return
        }
        // 通过 preload 桥接的 webUtils 获取真实路径（兼容上下文隔离）
        const filePath = window.api.getPathForFile(files[0])
        console.log('[FileDrop] Dropped:', filePath)
    }

    return {
        canvasWrapper,
        scale,
        isDragOver,
        pickerMenuOpen,
        togglePickerMenu,
        handleSelectFile,
        handleSelectDirectory,
        handleSelectDb,
        handleDrop,
        errorVisible,
        errorTitle,
        errorMessage,
        errorDetail,
        handleDismissError
    }
}
