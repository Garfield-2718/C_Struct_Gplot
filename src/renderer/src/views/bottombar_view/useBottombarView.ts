import { ref, computed, nextTick } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StructNodeRecord } from '@/views/canvas_view/useCanvasView'
import { errorMessageKey } from '../../../../shared/errors'
import type { AppError } from '../../../../shared/errors'

/** add-node 通道返回结构，与主进程 ipc-handlers.ts 的 AddNodeResult 对齐 */
interface AddNodeResult {
    success: boolean
    hashes: string[]
}

/** useBottombarView 的返回结构 */
interface BottombarViewApi {
    collapsed: Ref<boolean>
    handleToggleCollapse: () => void
    handleModeToggleClick: () => void
    handleAddNodeClick: () => void
    /** 「添加节点」对话框是否可见 */
    isAddNodeDialogVisible: Ref<boolean>
    /** 对话框中输入的节点内容：底层以字符串保存 */
    newNodeName: Ref<string>
    /** 确认新增：把字符串发送给主进程并关闭对话框 */
    handleAddNodeConfirm: () => Promise<void>
    /** 取消新增：关闭对话框并清空输入 */
    handleAddNodeCancel: () => void
    /** 错误提示弹窗是否可见：手动导入结构体失败时展示 */
    errorVisible: Ref<boolean>
    /** 错误弹窗标题 */
    errorTitle: ComputedRef<string>
    /** 错误弹窗正文（由错误码翻译而来） */
    errorMessage: ComputedRef<string>
    /** 错误弹窗的原始诊断详情（不翻译，可空） */
    errorDetail: ComputedRef<string>
    /** 关闭错误提示弹窗 */
    handleDismissError: () => void
}

/**
 * 底边栏的组合式函数：工具栏按键与收起/展开状态的处理。
 * @param addNodeInputRef 对话框输入框引用（由组件用本地 ref 声明并绑定到模板，供打开时自动聚焦）
 * @param onNodeAdded 新增节点成功并查询到节点信息后的回调，用于把记录交给画布渲染
 * @param onToggleMode 模式切换按键点击的回调，上报「选择 ⇄ 编辑」切换意图（模式状态由画布持有）
 */
export function useBottombarView(
    addNodeInputRef: Ref<HTMLInputElement | null>,
    onNodeAdded?: (record: StructNodeRecord) => void,
    onToggleMode?: () => void
): BottombarViewApi {
    /** 底边栏是否收起：收起后仅保留顶部的三角手柄 */
    const collapsed = ref(false)

    /** 「添加节点」对话框是否可见 */
    const isAddNodeDialogVisible = ref(false)

    /** 对话框中输入的节点内容：底层以字符串保存，确认后发送给主进程 */
    const newNodeName = ref('')

    const { t } = useI18n({ useScope: 'global' })

    /**
     * 错误提示弹窗状态：手动导入结构体失败时展示具体原因。
     * 与 useImportProject 的错误处理模式保持一致：error 保存结构化错误，
     * title/message/detail 由 computed 派生，message 经 errorMessageKey 映射翻译。
     */
    const errorVisible = ref(false)
    const error = ref<AppError | null>(null)
    const errorTitle = computed(() => t('bottombar.addNodeFailed'))
    const errorMessage = computed(() =>
        error.value ? t(errorMessageKey(error.value.code), error.value.params ?? {}) : ''
    )
    const errorDetail = computed(() => error.value?.detail ?? '')

    /** 弹出错误提示：记录错误并显示弹窗 */
    function showError(failure: AppError): void {
        error.value = failure
        errorVisible.value = true
    }

    /** 关闭错误提示弹窗 */
    function handleDismissError(): void {
        errorVisible.value = false
    }

    /** 点击顶部三角手柄切换收起/展开 */
    function handleToggleCollapse(): void {
        collapsed.value = !collapsed.value
    }

    /**
     * 模式切换按键点击：在「选择模式 ⇄ 编辑模式」间切换。
     * 实际模式状态由画布（useCanvasView）持有，这里仅通过 onToggleMode 上报切换意图。
     */
    function handleModeToggleClick(): void {
        onToggleMode?.()
    }

    /** 添加节点按键点击：弹出对话框让用户输入要新增的节点 */
    function handleAddNodeClick(): void {
        newNodeName.value = ''
        isAddNodeDialogVisible.value = true
        // 等待对话框 DOM 渲染完成后自动聚焦输入框
        void nextTick(() => addNodeInputRef.value?.focus())
    }

    /** 取消新增：关闭对话框并清空输入 */
    function handleAddNodeCancel(): void {
        isAddNodeDialogVisible.value = false
        newNodeName.value = ''
    }

    /**
     * 确认新增：把输入字符串发给主进程存入红黑树；若返回 success=true，
     * 逐条用返回的节点 hash 调用 query-node 拉取信息，并交由 onNodeAdded 回调渲染到画布。
     * 同名结构体在库中可能对应多条定义（含 0 字段的前向声明），此处全部渲染，
     * 各卡片由 addStructNode 按 30px 递增偏移错开，避免完全重叠。
     * 失败时弹出错误提示：未命中任何记录 → NODE_NOT_FOUND；IPC 异常或全部 query-node 落空 → NODE_LOAD_FAILED。
     */
    async function handleAddNodeConfirm(): Promise<void> {
        const nodeName = newNodeName.value.trim()
        if (!nodeName) {
            console.warn('[bottombar] 节点内容为空，已忽略本次新增')
            return
        }
        // 沿用 electron-toolkit 暴露的 ipcRenderer，与导入页调用方式保持一致
        let result: AddNodeResult | undefined
        try {
            result = (await window.electron.ipcRenderer.invoke('add-node', nodeName)) as
                AddNodeResult | undefined
        } catch (cause) {
            // IPC 调用本身抛错（如主进程异常）：关闭对话框并提示加载失败
            isAddNodeDialogVisible.value = false
            newNodeName.value = ''
            console.error('[bottombar] add-node 调用异常:', cause)
            showError({
                code: 'NODE_LOAD_FAILED',
                detail: cause instanceof Error ? cause.message : String(cause)
            })
            return
        }
        isAddNodeDialogVisible.value = false
        newNodeName.value = ''
        console.log('[bottombar] 新增节点结果:', result)
        // success 为 true 时取回全部命中记录的 hash（同名可能有多条定义），否则跳过后续查询与渲染
        const hashes = result?.success ? result.hashes : []
        if (hashes.length === 0) {
            // 数据库中未找到该结构体（或无活动库）：提示未找到节点
            console.warn('[bottombar] 新增失败或未返回 hash，跳过查询渲染:', nodeName)
            showError({ code: 'NODE_NOT_FOUND' })
            return
        }
        // 逐条查询并渲染：同名多定义（含前向声明）全部呈现，单条查询失败不影响其余
        let renderedCount = 0
        for (const hash of hashes) {
            const record = (await window.electron.ipcRenderer.invoke(
                'query-node',
                hash
            )) as StructNodeRecord | null
            if (!record) {
                console.warn('[bottombar] query-node 未返回节点信息:', hash)
                continue
            }
            onNodeAdded?.(record)
            renderedCount++
        }
        // 命中 hash 但均无法查询到节点信息：视为加载失败并提示
        if (renderedCount === 0) {
            console.warn('[bottombar] 全部 hash 均未查到节点信息:', nodeName)
            showError({ code: 'NODE_LOAD_FAILED' })
        }
    }

    return {
        collapsed,
        handleToggleCollapse,
        handleModeToggleClick,
        handleAddNodeClick,
        isAddNodeDialogVisible,
        newNodeName,
        handleAddNodeConfirm,
        handleAddNodeCancel,
        errorVisible,
        errorTitle,
        errorMessage,
        errorDetail,
        handleDismissError
    }
}
