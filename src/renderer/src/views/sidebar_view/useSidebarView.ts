import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { StructNodeData, StructNodeRecord } from '@/views/canvas_view/useCanvasView'
import type { MessageKey } from '../../../../shared/locales/types'

/** 侧边栏宽度允许的范围（px） */
const MIN_SIDEBAR_WIDTH = 160
const MAX_SIDEBAR_WIDTH = 640
/** 侧边栏初始宽度（px） */
const DEFAULT_SIDEBAR_WIDTH = 280
/** 拖拽热区宽度（px）：手柄覆盖侧边栏右缘一小段区域 */
const HANDLE_SIZE = 8

/** 分段内容区 max-height 下限（px）：可拖动收拢至 0 完全不展示；取消上限，默认无限制完整展示内容 */
const MIN_SECTION_HEIGHT = 0

/** 分段状态：支持点击标题栏折叠/展开，拖动底边框调节内容区 max-height 上限 */
export interface SidebarSectionState {
    /** 是否折叠 */
    collapsed: boolean
    /**
     * 展开时内容区 max-height 上限（px）；`null` 表示无上限（CSS 映射为 `max-height: none`）。
     * 内容不足则按内容收缩不留白，超出上限则内部滚动。
     */
    height: number | null
}

/** 元素信息行：描述当前选中元素的键值对，值过长时自动换行并撑高本行 */
export interface SidebarInfoRow {
    key: MessageKey
    value: string
    /** 是否在值前渲染「选中元素显隐」小眼睛（仅名称行）：点击切换选中元素在画布上的显隐 */
    visibilityToggle?: boolean
}

/** 节点信息行：父/子节点列表中每个节点占一行 */
export interface SidebarNodeRow {
    id: string
    /** 节点在红黑树中的键（结构体 hash）：显示时按此 hash 加载并渲染到画布 */
    hash: string
    /** 节点显示名称，如 'struct mesh_core (a1b2c3)' */
    label: string
    /** 行是否可见（是否已渲染到画布），由行侧眼睛按键切换；默认不可见 */
    visible: boolean
}

/** query-node-labels IPC 返回的单条节点标题 */
interface NodeLabelResult {
    hash: string
    title: string
}

/** add-node-by-hash 通道返回结构，与主进程 ipc-handlers.ts 的 AddNodeResult 对齐 */
interface AddNodeResult {
    success: boolean
    hashes: string[]
}

/** 侧边栏与画布联动的回调：显示节点交画布渲染，隐藏节点交画布移除（保留红黑树缓存） */
interface SidebarCallbacks {
    onShowNode?: (record: StructNodeRecord) => void
    onHideNode?: (hash: string) => void
}

/** useSidebarView 的返回结构 */
interface SidebarViewApi {
    sidebarWidth: Ref<number>
    handleRight: ComputedRef<number>
    elementInfoRows: Ref<SidebarInfoRow[]>
    parentNodes: Ref<SidebarNodeRow[]>
    childNodes: Ref<SidebarNodeRow[]>
    /** 选中元素当前是否在画布上显示：驱动名称行小眼睛的显隐态 */
    selectedNodeVisible: ComputedRef<boolean>
    sectionStates: Record<'elementInfo' | 'parentNodes' | 'childNodes', SidebarSectionState>
    handleStartResize: (event: MouseEvent) => void
    handleToggleRowVisible: (row: SidebarNodeRow) => Promise<void>
    /** 名称行小眼睛：切换当前选中元素在画布上的显隐 */
    handleToggleSelectedVisible: () => Promise<void>
    handleToggleSection: (section: SidebarSectionState) => void
    handleStartResizeSection: (section: SidebarSectionState, event: MouseEvent) => void
}

/**
 * 侧边栏的组合式函数：鼠标按住右缘手柄拖动调节宽度；
 * 根据画布选中节点动态展示元素信息、父节点列表与子节点列表，某段内容为空时该段默认折叠；
 * 父/子节点行的眼睛显隐精确反映该节点当前是否已在画布上，点击眼睛切换显示（按 hash 加载并渲染）/隐藏（仅移除渲染）。
 * @param selectedNode 当前选中节点的数据（来自 useCanvasView 的 selectedNodeData）
 * @param canvasNodeIds 画布上已渲染节点的 id（hash）列表（来自 useCanvasView 的 canvasNodeIds），驱动各行 visible
 * @param callbacks 与画布联动的回调：onShowNode 渲染节点、onHideNode 移除节点渲染
 */
export function useSidebarView(
    selectedNode: Ref<StructNodeData | null>,
    canvasNodeIds: Ref<string[]>,
    callbacks: SidebarCallbacks = {}
): SidebarViewApi {
    const sidebarWidth = ref(DEFAULT_SIDEBAR_WIDTH)

    /** 手柄相对侧边栏右缘的偏移，使热区居中覆盖在边缘上 */
    const handleRight = computed(() => -HANDLE_SIZE / 2)

    /** 拖动起点快照：按下时的鼠标横坐标与当前宽度 */
    let dragStartX = 0
    let dragStartWidth = 0

    function handleMouseMove(event: MouseEvent): void {
        // 侧边栏贴靠左侧，向右拖动（位移为正）时宽度增大
        const delta = event.clientX - dragStartX
        const next = dragStartWidth + delta
        sidebarWidth.value = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, next))
    }

    function handleMouseUp(): void {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
    }

    function handleStartResize(event: MouseEvent): void {
        event.preventDefault()
        dragStartX = event.clientX
        dragStartWidth = sidebarWidth.value
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
    }

    onBeforeUnmount(handleMouseUp)

    /** 三段初始状态：默认展开，内容区 max-height 上限为 null（无限制）；
     * 由于 CSS 采用 max-height + 内容自适应，内容多长就展示多长，侧边栏自身溢出时由 .sidebar-content 滚动 */
    const sectionStates = reactive({
        elementInfo: { collapsed: false, height: null },
        parentNodes: { collapsed: false, height: null },
        childNodes: { collapsed: false, height: null }
    })

    /** 点击标题栏切换分段折叠/展开：展开时同步将 max-height 上限重置为 null（无限制），
     * 避免之前拖动缩小后、折叠再展开时内容仍被截断需手动拉伸 */
    function handleToggleSection(section: SidebarSectionState): void {
        section.collapsed = !section.collapsed
        if (!section.collapsed) {
            section.height = null
        }
    }

    /** 分段高度拖拽上下文：目标分段与按下时的起点快照 */
    let sectionResizeTarget: SidebarSectionState | null = null
    let sectionResizeStartY = 0
    let sectionResizeStartHeight = 0

    function handleSectionMouseMove(event: MouseEvent): void {
        if (!sectionResizeTarget) return
        // 分段自上而下排列，向下拖动（位移为正）时 max-height 上限增大；不再封顶，仅受下限 0 约束
        const delta = event.clientY - sectionResizeStartY
        const next = sectionResizeStartHeight + delta
        sectionResizeTarget.height = Math.max(MIN_SECTION_HEIGHT, next)
    }

    function handleSectionMouseUp(): void {
        sectionResizeTarget = null
        window.removeEventListener('mousemove', handleSectionMouseMove)
        window.removeEventListener('mouseup', handleSectionMouseUp)
    }

    /** 按住分段底边框开始拖拽调节内容区 max-height 上限 */
    function handleStartResizeSection(section: SidebarSectionState, event: MouseEvent): void {
        event.preventDefault()
        sectionResizeTarget = section
        sectionResizeStartY = event.clientY
        // height 为 null 时无上限，拖拽需要一个具体数值起点：以内容区当前 content-box 高度作为初始值，
        // 避免 null 与 delta 相加无意义、也避免一拖就弹回无限制；
        // max-height 默认约束 content-box，而 clientHeight = content + padding，需减去上下 padding 才与 max-height 对齐
        if (section.height === null) {
            const resizerEl = event.currentTarget as HTMLElement | null
            const bodyEl =
                resizerEl?.parentElement?.querySelector<HTMLElement>('.sidebar-section-body')
            if (bodyEl) {
                const cs = window.getComputedStyle(bodyEl)
                const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
                sectionResizeStartHeight = Math.max(0, bodyEl.clientHeight - paddingY)
            } else {
                sectionResizeStartHeight = 0
            }
        } else {
            sectionResizeStartHeight = section.height
        }
        window.addEventListener('mousemove', handleSectionMouseMove)
        window.addEventListener('mouseup', handleSectionMouseUp)
    }

    onBeforeUnmount(handleSectionMouseUp)

    /** 元素信息、父节点列表、子节点列表：根据选中节点动态计算 */
    const elementInfoRows = ref<SidebarInfoRow[]>([])
    const parentNodes = ref<SidebarNodeRow[]>([])
    const childNodes = ref<SidebarNodeRow[]>([])

    /** 批量查询节点标题：调用主进程 query-node-labels 将 hash 解析为可读名称 */
    async function queryNodeLabels(hashes: string[]): Promise<NodeLabelResult[]> {
        // ipcRenderer.invoke 采用 HTML 结构化克隆传参，无法克隆 Vue 响应式 Proxy 数组，
        // 必须先展开为普通字符串数组（元素为原始值），否则抛 "An object could not be cloned"
        const plainHashes = [...hashes]
        if (plainHashes.length === 0) return []
        const result = (await window.electron.ipcRenderer.invoke(
            'query-node-labels',
            plainHashes
        )) as NodeLabelResult[]
        return Array.isArray(result) ? result : []
    }

    /** 防止快速切换选中节点时旧异步查询覆盖新结果的序号守卫 */
    let querySeq = 0

    /**
     * 根据内容有无自动折叠/展开分段；当分段从「折叠」跳变到「展开」时，
     * 同步将 max-height 上限重置为 null（无限制），确保新内容不被旧的小高度截断。
     * 已处于展开态的分段保持当前 height，尊重用户手动拖拽的自定义高度。
     */
    function applySectionCollapse(section: SidebarSectionState, hasContent: boolean): void {
        const nextCollapsed = !hasContent
        if (section.collapsed && !nextCollapsed) {
            section.height = null
        }
        section.collapsed = nextCollapsed
    }

    watch(
        selectedNode,
        async (node) => {
            const seq = ++querySeq
            if (!node) {
                elementInfoRows.value = []
                parentNodes.value = []
                childNodes.value = []
                // 无选中元素：三段内容均为空，全部默认折叠
                applySectionCollapse(sectionStates.elementInfo, false)
                applySectionCollapse(sectionStates.parentNodes, false)
                applySectionCollapse(sectionStates.childNodes, false)
                return
            }

            // 元素信息：从标题解析名称，类型取 kind，源文件取节点数据的 sourceFile，字段数取 fields 长度
            const displayName = node.title.replace(/\s*\(\w+\)$/, '')
            elementInfoRows.value = [
                // 名称行带小眼睛：控制当前选中元素在画布上的显隐（与父/子节点行眼睛一致）
                { key: 'sidebar.name', value: displayName, visibilityToggle: true },
                { key: 'sidebar.type', value: node.kind },
                { key: 'sidebar.sourceFile', value: node.sourceFile ?? '' },
                { key: 'sidebar.fieldCount', value: String(node.fields?.length ?? 0) }
            ]
            // 内容为空则该段默认折叠，非空则展开（跳变时同步重置 max-height 上限）
            applySectionCollapse(sectionStates.elementInfo, elementInfoRows.value.length > 0)

            // 父节点列表：去重后将 parentHashes 解析为可读标题
            // 与子节点侧一致做 Set 去重：主进程 findParentHashes 已用 SELECT DISTINCT 在 DB 层去重，
            // 此处再防御一层，避免历史数据、缓存或后续改动重新引入重复项
            const parentHashes = [...new Set(node.parentHashes ?? [])]
            const parentLabels = await queryNodeLabels(parentHashes)
            if (seq !== querySeq) return
            parentNodes.value = parentLabels.map(({ hash, title }) => ({
                id: `parent-${hash}`,
                hash,
                label: title,
                // 初值反映画布现状：该父节点已在画布上则眼睛为显示态
                visible: canvasNodeIds.value.includes(hash)
            }))
            // 无父节点则该段默认折叠
            applySectionCollapse(sectionStates.parentNodes, parentNodes.value.length > 0)

            // 子节点列表：去重并过滤空值后解析为可读标题
            const childHashes = [
                ...new Set(
                    (node.childHashes ?? []).filter((h): h is string => h !== null && h !== '')
                )
            ]
            const childLabels = await queryNodeLabels(childHashes)
            if (seq !== querySeq) return
            childNodes.value = childLabels.map(({ hash, title }) => ({
                id: `child-${hash}`,
                hash,
                label: title,
                // 初值反映画布现状：该子节点已在画布上则眼睛为显示态
                visible: canvasNodeIds.value.includes(hash)
            }))
            // 无子节点则该段默认折叠
            applySectionCollapse(sectionStates.childNodes, childNodes.value.length > 0)
        },
        { immediate: true }
    )

    /**
     * 画布节点集合变化时同步各行 visible，使眼睛状态精确反映节点是否已在画布上。
     * 覆盖：显示/隐藏操作后画布增删节点、底边栏添加节点、切换选中节点等所有画布变化场景。
     * visible 以画布节点集为唯一数据源，handleToggleRowVisible 不再直接改它。
     */
    watch(canvasNodeIds, (ids) => {
        const idSet = new Set(ids)
        for (const row of parentNodes.value) row.visible = idSet.has(row.hash)
        for (const row of childNodes.value) row.visible = idSet.has(row.hash)
    })

    /** 选中元素是否在画布上显示：选中元素必在画布上，故通常恒为 true；隐藏后选中态消失、元素信息随之清空 */
    const selectedNodeVisible = computed(() => {
        const hash = selectedNode.value?.hash
        return hash !== undefined && canvasNodeIds.value.includes(hash)
    })

    /**
     * 眼睛按键核心：切换指定 hash 节点在画布上的显隐。
     * - 显示 → 隐藏：仅通知 onHideNode 从画布移除该节点渲染，保留红黑树缓存（不删记录）；
     * - 隐藏 → 显示：复用与「导入节点」相同的逻辑，按 hash 调 add-node-by-hash 写入红黑树并拿到
     *   返回的 hash，再调 query-node 取回节点信息，交 onShowNode 渲染到画布。
     * 两种情况都不直接改 visible：画布增删节点后 canvasNodeIds 变化，由 watch(canvasNodeIds)
     * 统一把各行 visible 同步为「该节点是否在画布上」，确保眼睛状态与画布严格一致（渲染失败则不会误亮）。
     */
    async function toggleNodeVisibility(hash: string, visible: boolean): Promise<void> {
        if (visible) {
            // 已在画布显示 → 隐藏：仅移除渲染，保留红黑树缓存（visible 由 watch(canvasNodeIds) 回落）
            callbacks.onHideNode?.(hash)
            return
        }
        // 未显示 → 显示：按 hash 写入红黑树（与导入节点相同的查库→转化→写树逻辑）
        const result = (await window.electron.ipcRenderer.invoke('add-node-by-hash', hash)) as
            AddNodeResult | undefined
        const addedHash = result?.success ? result.hashes[0] : undefined
        if (!addedHash) {
            console.warn('[sidebar] 按 hash 新增节点失败:', hash)
            return
        }
        // 用返回的 hash 调 get 方法（query-node）取回节点完整信息，交画布渲染（visible 由 watch(canvasNodeIds) 置真）
        const record = (await window.electron.ipcRenderer.invoke(
            'query-node',
            addedHash
        )) as StructNodeRecord | null
        if (!record) {
            console.warn('[sidebar] query-node 未返回节点信息:', addedHash)
            return
        }
        callbacks.onShowNode?.(record)
    }

    /** 父/子节点行的眼睛按键：切换该行对应节点的显隐 */
    async function handleToggleRowVisible(row: SidebarNodeRow): Promise<void> {
        await toggleNodeVisibility(row.hash, row.visible)
    }

    /** 名称行的眼睛按键：切换「当前选中元素」在画布上的显隐（选中元素必在画布，故点击即隐藏） */
    async function handleToggleSelectedVisible(): Promise<void> {
        const hash = selectedNode.value?.hash
        if (!hash) return
        await toggleNodeVisibility(hash, selectedNodeVisible.value)
    }

    return {
        sidebarWidth,
        handleRight,
        elementInfoRows,
        parentNodes,
        childNodes,
        selectedNodeVisible,
        sectionStates,
        handleStartResize,
        handleToggleRowVisible,
        handleToggleSelectedVisible,
        handleToggleSection,
        handleStartResizeSection
    }
}
