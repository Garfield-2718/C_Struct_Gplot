import { ref, watch, markRaw, computed, onActivated, onDeactivated } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import {
    useVueFlow,
    type Connection,
    type Edge,
    type EdgeTypesObject,
    type EdgeUpdateEvent,
    type GraphEdge,
    type GraphNode,
    type Node,
    type NodeTypesObject,
    type ViewportTransform
} from '@vue-flow/core'
import StructNode from './struct_node/StructNode.vue'
import FlowArrowEdge from './flow_arrow_edge/FlowArrowEdge.vue'
import { useSettings } from '@/stores/settings'

/**
 * 自定义节点类型注册：struct 卡片节点。
 * 用 markRaw 标记组件：nodeTypes 传入 VueFlow 后会被纳入其响应式 store，
 * 组件对象若被 Proxy 代理会触发 "Vue received a Component that was made a reactive object"
 * 警告并带来无谓的依赖追踪开销；markRaw 使 Vue 跳过对它的响应式化。
 */
const nodeTypes: NodeTypesObject = { struct: markRaw(StructNode) }

/**
 * 自定义连线类型注册：flowArrow —— 选中结构体时高亮其父/子连线，
 * 用「沿路径从起点流动到终点的箭头」取代吸附在节点上的静态箭头；同样用 markRaw 避免被响应式代理。
 */
const edgeTypes: EdgeTypesObject = { flowArrow: markRaw(FlowArrowEdge) }

/** 点阵间距在屏幕上允许的范围（px），超出后回绕到另一端 */
const MIN_SCREEN_GAP = 30
const MAX_SCREEN_GAP = 40
/** 回绕比例因子：间距超出上限时除以该值，低于下限时乘以该值 */
const GAP_WRAP_RATIO = MAX_SCREEN_GAP / MIN_SCREEN_GAP
/** 点在屏幕上的恒定直径（px）：防止缩小时点变成亚像素被抗锯齿糊成灰色 */
const DOT_SCREEN_SIZE = 4

/**
 * 画布交互模式：
 * - 'select' 选择模式（默认）：仅选中/查看节点，连线吸附点锁定不可调整
 * - 'edit'   编辑模式：开放「调整连线在节点左/右侧的吸附点」等编辑能力（后续接入）
 * 状态由画布（本组合式函数）持有，底边栏两态按键经 CanvasView 下发切换意图。
 */
export type CanvasMode = 'select' | 'edit'

/** 结构体卡片节点数据：对应 struct_mesh_leaf.svg 中的 struct/enum/union 卡片 */
export interface StructNodeData {
    /** 结构体唯一标识（= 画布节点 id，与红黑树键一致）：供侧边栏控制选中元素显隐 */
    hash: string
    /** 卡片标题，如 'struct mesh_leaf (b0e19e)' */
    title: string
    /** 元素种类，决定标题栏颜色 */
    kind: 'struct' | 'enum' | 'union'
    /** 卡片固定宽度（px），与 SVG 中矩形宽度一致 */
    width: number
    /** 折叠节点：仅显示 '......'，无字段行 */
    collapsed?: boolean
    /** 字段行文本列表 */
    fields?: string[]
    /** 与 fields 同序：各字段指向的子结构体 hash 数组（无子节点则 null），用于自动连线与侧边栏展示 */
    childHashes?: (string[] | null)[]
    /** 引用当前结构体的父结构体 hash 列表（来自 relations 表），用于侧边栏展示 */
    parentHashes?: string[]
    /** 源文件路径（来自 DB structures 表 source_file 列），用于侧边栏「源文件」展示 */
    sourceFile?: string | null
}

/** 主进程 query-node 返回的结构体记录：ui_json 为画布格式 StructNodeData 的 JSON 字符串 */
export interface StructNodeRecord {
    id: number
    hash: string
    data_type_first: string
    data_type_latter: string
    source_file: string | null
    ui_json: string
}

/** 连线样式：与 SVG 一致的灰色曲线，无箭头 */
const EDGE_STYLE = { stroke: '#999999', strokeWidth: 1.5 }

/** 高亮连线的统一线宽（px）：选中时父/子节点连线均加粗到 3px */
const SELECTED_EDGE_WIDTH = 3

/** 创建结构体卡片节点：position 为 SVG 中卡片矩形左上角坐标 */
function createStructNode(id: string, x: number, y: number, data: StructNodeData): Node {
    return { id, type: 'struct', position: { x, y }, data }
}

/**
 * 创建连线：默认从源节点指定字段行「右侧」出线，连到目标节点标题栏「左侧」入线（与参考 SVG 一致）。
 * 两侧吸附点均可在编辑模式下被拖拽换边，故 handle id 统一带 -left/-right 后缀。
 */
function createStructEdge(id: string, source: string, sourceField: number, target: string): Edge {
    return {
        id,
        source,
        target,
        sourceHandle: `field-${sourceField}-right`,
        targetHandle: 'header-left',
        style: EDGE_STYLE
    }
}

/** useCanvasView 的返回结构 */
interface CanvasViewApi {
    nodes: Ref<Node[]>
    edges: Ref<Edge[]>
    nodeTypes: NodeTypesObject
    edgeTypes: EdgeTypesObject
    backgroundGap: Ref<number>
    dotSize: Ref<number>
    handleViewportChange: (viewport: ViewportTransform) => void
    /** 编辑模式下拖拽连线端点到另一侧吸附点：用回传的新 connection 覆盖该连线的 handle */
    handleEdgeUpdate: (payload: EdgeUpdateEvent) => void
    /** 编辑模式下从吸附点拖拽新建连线：据 connection 生成新 Edge 并入画布 */
    handleConnect: (connection: Connection) => void
    /** 依据主进程查询到的结构体记录，在画布上新增一个结构体卡片节点 */
    addStructNode: (record: StructNodeRecord) => void
    /** 按 hash 从画布移除节点渲染（保留红黑树缓存），供侧边栏「隐藏」父/子节点 */
    removeStructNode: (hash: string) => void
    /** 当前选中节点的数据（单选时取第一个），供侧边栏展示元素信息 */
    selectedNodeData: Ref<StructNodeData | null>
    /** 画布上所有节点的 id（hash）列表，供侧边栏同步眼睛显隐初值 */
    canvasNodeIds: ComputedRef<string[]>
    /** 当前画布交互模式：'select' 选择模式｜'edit' 编辑模式 */
    canvasMode: Ref<CanvasMode>
    /** 切换画布交互模式（选择 ⇄ 编辑），由底边栏两态按键触发 */
    toggleCanvasMode: () => void
    /** 是否处于编辑模式：门控「连线吸附点左右调整」等编辑能力 */
    isEditMode: ComputedRef<boolean>
}

/** Canvas 页面的组合式函数：基于 Vue Flow 的节点编辑器 */
export function useCanvasView(): CanvasViewApi {
    const { viewport, dimensions } = useVueFlow()
    const globalSettings = useSettings()

    const nodes = ref([]) as Ref<Node[]>
    const edges = ref([]) as Ref<Edge[]>

    /** 当前画布交互模式：默认选择模式（仅选中/查看），编辑模式下开放吸附点调整等能力 */
    const canvasMode = ref<CanvasMode>('select')

    /** 切换画布交互模式（选择 ⇄ 编辑）：由底边栏两态按键触发 */
    function toggleCanvasMode(): void {
        canvasMode.value = canvasMode.value === 'select' ? 'edit' : 'select'
    }

    /** 是否处于编辑模式：后续用于门控「连线吸附点左右调整」等编辑能力 */
    const isEditMode = computed(() => canvasMode.value === 'edit')

    /** 已动态新增的节点数：用于在视口中心施加递增偏移，避免多节点完全重叠 */
    let addedNodeCount = 0

    /** 背景点阵间距（流坐标），随缩放动态回绕，使屏幕点距保持在 [MIN_SCREEN_GAP, MAX_SCREEN_GAP] */
    const backgroundGap = ref(40)

    /** 点直径（流坐标），用 zoom 反向补偿，使屏幕上始终约为 DOT_SCREEN_SIZE px */
    const dotSize = ref(DOT_SCREEN_SIZE)

    /** 视口变化时校验点距：放大越上限 → 跳到下限端（点变密），缩小越下限 → 跳到上限端（点变疏） */
    function handleViewportChange({ zoom }: ViewportTransform): void {
        let gap = backgroundGap.value
        while (gap * zoom > MAX_SCREEN_GAP) gap /= GAP_WRAP_RATIO
        while (gap * zoom < MIN_SCREEN_GAP) gap *= GAP_WRAP_RATIO
        if (gap !== backgroundGap.value) backgroundGap.value = gap
        dotSize.value = DOT_SCREEN_SIZE / zoom
    }

    /** 当前选中节点的数据：单选时取第一个选中节点的 data，无选中时为 null，供侧边栏联动 */
    const selectedNodeData = ref<StructNodeData | null>(null)

    /** 画布上所有节点的 id（即结构体 hash）列表：供侧边栏判断父/子节点是否已渲染，同步眼睛显隐初值 */
    const canvasNodeIds = computed(() => nodes.value.map((node) => node.id))

    /** 节点选中状态变化时的触发逻辑：高亮关联连线（流动箭头）并同步选中节点数据给侧边栏 */
    function handleSelectionChange(selectedNodes: Node[]): void {
        // 高亮与选中节点相连的连线，颜色从全局设置读取：
        // - 选中节点作为 target（连线来自父节点）→ parentEdgeColor
        // - 选中节点作为 source（连线指向子节点）→ childEdgeColor
        // - flowAnimationEnabled 为 true 时使用 flowArrow 自定义连线（流动箭头动画）；否则仅加粗+变色
        const selectedIds = new Set(selectedNodes.map((node) => node.id))
        const childColor = globalSettings.childEdgeColor
        const parentColor = globalSettings.parentEdgeColor
        const animationEnabled = globalSettings.flowAnimationEnabled
        edges.value = edges.value.map((edge) => {
            let stroke = EDGE_STYLE.stroke
            let strokeWidth = EDGE_STYLE.strokeWidth
            let highlighted = false
            if (selectedIds.has(edge.target)) {
                // 选中节点是 target → source 是其父节点
                stroke = parentColor
                strokeWidth = SELECTED_EDGE_WIDTH
                highlighted = true
            } else if (selectedIds.has(edge.source)) {
                // 选中节点是 source → target 是其子节点
                stroke = childColor
                strokeWidth = SELECTED_EDGE_WIDTH
                highlighted = true
            }
            return {
                ...edge,
                // 高亮连线且动画开启时用 flowArrow 自定义类型；否则用默认贝塞尔连线
                type: highlighted && animationEnabled ? 'flowArrow' : undefined,
                style: { ...EDGE_STYLE, stroke, strokeWidth },
                animated: false,
                markerEnd: undefined
            }
        })

        // 同步选中节点数据给侧边栏：取第一个选中节点的 data，无选中时置 null
        selectedNodeData.value =
            selectedNodes.length > 0 ? (selectedNodes[0].data as StructNodeData) : null
    }

    /**
     * 监听节点选中状态变化：当前版本 Vue Flow（1.48.2）没有 selectionChange 事件，
     * 改由 v-model:nodes 同步回的 selected 字段驱动，覆盖单击、框选、Ctrl 多选与取消选中；
     * 只监听选中节点 id 集合签名，避免拖拽等无关变化反复触发
     */
    watch(
        () =>
            nodes.value
                .filter((node) => (node as GraphNode).selected)
                .map((node) => node.id)
                .join(','),
        () => handleSelectionChange(nodes.value.filter((node) => (node as GraphNode).selected))
    )

    /**
     * 监听全局设置中的颜色/动画开关变化：设置页保存后即时重新应用连线样式，
     * 无需等到下次选中变化才生效。
     */
    watch(
        () => [
            globalSettings.childEdgeColor,
            globalSettings.parentEdgeColor,
            globalSettings.flowAnimationEnabled
        ],
        () => {
            const selected = nodes.value.filter((node) => (node as GraphNode).selected)
            if (selected.length > 0) handleSelectionChange(selected)
        }
    )

    /**
     * 编辑模式下拖拽连线端点到另一侧吸附点后触发：Vue Flow 校验通过后回传新的 connection，
     * 用它覆盖该连线的 source/target 与对应 handle，实现左右吸附点切换。
     * 未拖到有效吸附点时 Vue Flow 不触发本回调，连线保持原样，不会被误删。
     */
    function handleEdgeUpdate({ edge, connection }: EdgeUpdateEvent): void {
        edges.value = edges.value.map((e) =>
            e.id === edge.id
                ? {
                      ...e,
                      source: connection.source,
                      target: connection.target,
                      sourceHandle: connection.sourceHandle ?? null,
                      targetHandle: connection.targetHandle ?? null
                  }
                : e
        )
        console.log(
            '[canvas] 连线吸附点已调整:',
            edge.id,
            connection.sourceHandle,
            '→',
            connection.targetHandle
        )
    }

    /**
     * 编辑模式下从源吸附点拖到目标吸附点新建连线：Vue Flow 校验通过后回传 connection，
     * 据此生成一条与自动连线同构的 Edge 并入 edges；跳过无效端点、自环与端点完全相同的重复连线。
     */
    function handleConnect(connection: Connection): void {
        const { source, target } = connection
        const sourceHandle = connection.sourceHandle ?? null
        const targetHandle = connection.targetHandle ?? null
        // 缺少任一端或自环（源=目标）直接忽略
        if (!source || !target || source === target) {
            console.warn('[canvas] 连线端点无效，已忽略新建:', connection)
            return
        }
        // 去重：已存在「节点 + 吸附点」完全相同的连线则跳过，避免与自动连线或既有手动连线重叠
        const duplicated = edges.value.some(
            (e) =>
                e.source === source &&
                e.target === target &&
                (e.sourceHandle ?? null) === sourceHandle &&
                (e.targetHandle ?? null) === targetHandle
        )
        if (duplicated) {
            console.log(
                '[canvas] 连线已存在，跳过重复新建:',
                source,
                sourceHandle,
                '→',
                target,
                targetHandle
            )
            return
        }
        // id 由两端「节点 + 吸附点」组成，既唯一又便于后续去重
        const edgeId = `e-${source}-${sourceHandle}-${target}-${targetHandle}`
        edges.value = [
            ...edges.value,
            { id: edgeId, source, target, sourceHandle, targetHandle, style: EDGE_STYLE }
        ]
        console.log('[canvas] 已新建连线:', edgeId)
    }

    /**
     * 为新加入的结构体节点构建与画布上「已存在」节点的连线（不递归加载缺失的子节点）：
     * 正向——新节点各字段的 childHash 若已在画布，连「新节点字段 → 子节点」；
     * 反向——画布上已有节点的字段 childHash 若指向新节点，补「已有节点字段 → 新节点」。
     * 跳过自环与重复 id，返回新增的 Edge 列表。
     */
    function connectStructNode(hash: string, data: StructNodeData): Edge[] {
        const existingIds = new Set(nodes.value.map((node) => node.id))
        const existingEdgeIds = new Set(edges.value.map((edge) => edge.id))
        const result: Edge[] = []
        const pushEdge = (edge: Edge): void => {
            if (!existingEdgeIds.has(edge.id)) {
                existingEdgeIds.add(edge.id)
                result.push(edge)
            }
        }
        // 正向：新节点字段 → 已存在的子节点（每个字段可能对应多个子 hash）
        const children = data.childHashes ?? []
        children.forEach((childHashArr, fieldIndex) => {
            if (!childHashArr) return
            for (const childHash of childHashArr) {
                if (childHash !== hash && existingIds.has(childHash)) {
                    pushEdge(
                        createStructEdge(
                            `e-${hash}-f${fieldIndex}-${childHash}`,
                            hash,
                            fieldIndex,
                            childHash
                        )
                    )
                }
            }
        })
        // 反向：已存在节点的字段 → 新节点
        for (const node of nodes.value) {
            if (node.id === hash) continue
            const nodeData = node.data as StructNodeData | undefined
            const nodeChildren = nodeData?.childHashes ?? []
            nodeChildren.forEach((childHashArr, fieldIndex) => {
                if (!childHashArr) return
                for (const childHash of childHashArr) {
                    if (childHash === hash) {
                        pushEdge(
                            createStructEdge(
                                `e-${node.id}-f${fieldIndex}-${hash}`,
                                node.id,
                                fieldIndex,
                                hash
                            )
                        )
                    }
                }
            })
        }
        return result
    }

    /**
     * 依据主进程 query-node 返回的记录在画布新增结构体卡片节点：
     * 解析 ui_json（画布格式 StructNodeData）→ 以 hash 为节点 id 去重 → 追加到 nodes →
     * 与画布上已存在的相关节点自动连线。不改变当前视口缩放/平移，避免打断用户操作。
     */
    function addStructNode(record: StructNodeRecord): void {
        if (!record?.hash) {
            console.warn('[canvas] addStructNode: 记录缺少 hash，已忽略')
            return
        }
        if (nodes.value.some((node) => node.id === record.hash)) {
            console.log('[canvas] 节点已存在，跳过重复渲染:', record.hash)
            return
        }
        let data: StructNodeData
        try {
            // ui_json 由主进程转化生成、不含完整 hash（标题内仅为 6 位短 hash）；
            // 以 record.hash（= 节点 id）补齐 data.hash，保证与 canvasNodeIds 一致，供侧边栏控制选中元素显隐
            const parsed = JSON.parse(record.ui_json) as Omit<StructNodeData, 'hash'>
            data = { ...parsed, hash: record.hash }
        } catch (err) {
            console.error('[canvas] 解析节点 ui_json 失败:', err)
            return
        }
        // 将新节点放置在当前屏幕视口中心；多次添加时施加小偏移避免完全重叠
        // viewport / dimensions 为 Vue Flow store 中的 Ref，在 script 中必须 .value 才能拿到实际值
        const { x: vx, y: vy, zoom } = viewport.value
        const { width, height } = dimensions.value
        // 兜底：store 尚未初始化时 width/height/zoom 可能为 0，避免除零得到 Infinity/NaN 导致节点不可见
        const safeZoom = zoom > 0 ? zoom : 1
        const centerX = (width / 2 - vx) / safeZoom
        const centerY = (height / 2 - vy) / safeZoom
        const offset = addedNodeCount * 30
        const x = centerX - (data.width ?? 240) / 2 + offset
        const y = centerY - 60 + offset
        addedNodeCount++
        nodes.value = [...nodes.value, createStructNode(record.hash, x, y, data)]
        // 自动连线：仅连接画布上已存在的节点（正/反向），去重后并入 edges
        const addedEdges = connectStructNode(record.hash, data)
        if (addedEdges.length > 0) {
            edges.value = [...edges.value, ...addedEdges]
        }
        console.log(
            '[canvas] 已渲染新增节点:',
            record.hash,
            data.title,
            '新增连线',
            addedEdges.length
        )
    }

    /**
     * 按 hash 从画布移除节点的渲染（连同与其相连的连线），供侧边栏「隐藏」父/子节点使用。
     * 仅移除画布显示，不触碰主进程红黑树缓存；再次「显示」时可复用缓存快速恢复渲染。
     */
    function removeStructNode(hash: string): void {
        if (!nodes.value.some((node) => node.id === hash)) {
            console.log('[canvas] 节点不在画布上，跳过隐藏:', hash)
            return
        }
        nodes.value = nodes.value.filter((node) => node.id !== hash)
        edges.value = edges.value.filter((edge) => edge.source !== hash && edge.target !== hash)
        console.log('[canvas] 已隐藏节点（保留红黑树缓存）:', hash)
    }

    /**
     * 编辑模式下按 Delete/Backspace 隐藏当前选中的节点或连线：
     * - 节点：复用 removeStructNode（同时清理与其相连的所有连线），保留红黑树缓存，可通过侧边栏眼睛按键恢复；
     * - 连线：仅从画布 edges 数组过滤掉该连线，两端节点保持不变；
     * 焦点落在 INPUT / TEXTAREA / contenteditable 元素上时忽略，避免与文本编辑（删除字符）冲突。
     * 选择模式（非编辑模式）下本函数直接返回，Delete 不做任何处理。
     */
    function handleDeleteKeyDown(event: KeyboardEvent): void {
        if (!isEditMode.value) return
        if (event.key !== 'Delete' && event.key !== 'Backspace') return
        const target = event.target as HTMLElement | null
        if (target) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
        }
        // 收集当前选中的连线 id 与节点 id（快照，避免后续过滤时集合被修改）
        const selectedEdgeIds = new Set(
            edges.value.filter((edge) => (edge as GraphEdge).selected).map((edge) => edge.id)
        )
        const selectedNodeIds = nodes.value
            .filter((node) => (node as GraphNode).selected)
            .map((node) => node.id)
        if (selectedEdgeIds.size === 0 && selectedNodeIds.length === 0) return
        // 阻止浏览器默认行为（如 Backspace 触发历史后退）
        event.preventDefault()
        // 先移除选中的连线：避免随后按节点移除时重复过滤
        if (selectedEdgeIds.size > 0) {
            edges.value = edges.value.filter((edge) => !selectedEdgeIds.has(edge.id))
        }
        // 再按节点移除：removeStructNode 内部会一并清理与其相连的其余连线
        selectedNodeIds.forEach((hash) => removeStructNode(hash))
        console.log(
            '[canvas] 编辑模式 Delete：已隐藏选中连线',
            selectedEdgeIds.size,
            '条、节点',
            selectedNodeIds.length,
            '个'
        )
    }

    // 全局监听 keydown：编辑器画布本身不一定持有焦点（点击空白/侧边栏后仍希望 Delete 生效），
    // 故挂在 window 上，仅在编辑模式下响应；
    // 使用 onActivated/onDeactivated 配合 keep-alive：导航到设置页时移除监听，返回时重新挂载。
    onActivated(() => window.addEventListener('keydown', handleDeleteKeyDown))
    onDeactivated(() => window.removeEventListener('keydown', handleDeleteKeyDown))

    return {
        nodes,
        edges,
        nodeTypes,
        edgeTypes,
        backgroundGap,
        dotSize,
        handleViewportChange,
        handleEdgeUpdate,
        handleConnect,
        addStructNode,
        removeStructNode,
        selectedNodeData,
        canvasNodeIds,
        canvasMode,
        toggleCanvasMode,
        isEditMode
    }
}
