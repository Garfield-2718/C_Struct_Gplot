import { ref, nextTick } from 'vue'
import type { Ref } from 'vue'
import type { StructNodeRecord } from '@/views/canvas_view/useCanvasView'

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
     * 立即用返回的节点 hash 调用 query-node 拉取节点信息，并交由 onNodeAdded 回调渲染到画布。
     */
    async function handleAddNodeConfirm(): Promise<void> {
        const nodeName = newNodeName.value.trim()
        if (!nodeName) {
            console.warn('[bottombar] 节点内容为空，已忽略本次新增')
            return
        }
        // 沿用 electron-toolkit 暴露的 ipcRenderer，与导入页调用方式保持一致
        const result = (await window.electron.ipcRenderer.invoke('add-node', nodeName)) as
            AddNodeResult | undefined
        isAddNodeDialogVisible.value = false
        newNodeName.value = ''
        console.log('[bottombar] 新增节点结果:', result)
        // success 为 true 时取回新增节点的 hash，否则跳过后续查询与渲染
        const hash = result?.success ? result.hashes[0] : undefined
        if (!hash) {
            console.warn('[bottombar] 新增失败或未返回 hash，跳过查询渲染:', nodeName)
            return
        }
        // 立即用节点 hash 到红黑树查询该节点的完整信息
        const record = (await window.electron.ipcRenderer.invoke(
            'query-node',
            hash
        )) as StructNodeRecord | null
        if (!record) {
            console.warn('[bottombar] query-node 未返回节点信息:', hash)
            return
        }
        // 交给画布渲染该节点
        onNodeAdded?.(record)
    }

    return {
        collapsed,
        handleToggleCollapse,
        handleModeToggleClick,
        handleAddNodeClick,
        isAddNodeDialogVisible,
        newNodeName,
        handleAddNodeConfirm,
        handleAddNodeCancel
    }
}
