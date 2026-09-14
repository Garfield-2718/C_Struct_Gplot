import { ref, watch, nextTick, markRaw, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { Edge, GraphNode, Node, NodeTypesObject, ViewportTransform } from '@vue-flow/core'
import StructNode from './struct_node/StructNode.vue'

/**
 * 自定义节点类型注册：struct 卡片节点。
 * 用 markRaw 标记组件：nodeTypes 传入 VueFlow 后会被纳入其响应式 store，
 * 组件对象若被 Proxy 代理会触发 "Vue received a Component that was made a reactive object"
 * 警告并带来无谓的依赖追踪开销；markRaw 使 Vue 跳过对它的响应式化。
 */
const nodeTypes: NodeTypesObject = { struct: markRaw(StructNode) }

/** 点阵间距在屏幕上允许的范围（px），超出后回绕到另一端 */
const MIN_SCREEN_GAP = 30
const MAX_SCREEN_GAP = 40
/** 回绕比例因子：间距超出上限时除以该值，低于下限时乘以该值 */
const GAP_WRAP_RATIO = MAX_SCREEN_GAP / MIN_SCREEN_GAP
/** 点在屏幕上的恒定直径（px）：防止缩小时点变成亚像素被抗锯齿糊成灰色 */
const DOT_SCREEN_SIZE = 4

/** 结构体卡片节点数据：对应 struct_mesh_leaf.svg 中的 struct/enum/union 卡片 */
export interface StructNodeData {
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
    /** 与 fields 同序：各字段指向的子结构体 hash（无则 null），用于自动连线 */
    childHashes?: (string | null)[]
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

/** 选中元素关联连线的颜色：指向子节点的连线（选中节点作为 source）高亮为蓝色 */
const SELECTED_EDGE_COLOR_CHILD = '#2563eb'
/** 指向父节点的连线（选中节点作为 target）高亮为紫色 */
const SELECTED_EDGE_COLOR_PARENT = '#9333ea'
/** 高亮连线的统一线宽（px）：选中时父/子节点连线均加粗到 3px */
const SELECTED_EDGE_WIDTH = 3

/** 创建结构体卡片节点：position 为 SVG 中卡片矩形左上角坐标 */
function createStructNode(id: string, x: number, y: number, data: StructNodeData): Node {
    return { id, type: 'struct', position: { x, y }, data }
}

/** 创建连线：从源节点指定字段行右侧连到目标节点标题栏左侧 */
function createStructEdge(id: string, source: string, sourceField: number, target: string): Edge {
    return {
        id,
        source,
        target,
        sourceHandle: `field-${sourceField}`,
        targetHandle: 'header',
        style: EDGE_STYLE
    }
}

/** useCanvasView 的返回结构 */
interface CanvasViewApi {
    nodes: Ref<Node[]>
    edges: Ref<Edge[]>
    nodeTypes: NodeTypesObject
    backgroundGap: Ref<number>
    dotSize: Ref<number>
    handleViewportChange: (viewport: ViewportTransform) => void
    /** 依据主进程查询到的结构体记录，在画布上新增一个结构体卡片节点 */
    addStructNode: (record: StructNodeRecord) => void
    /** 按 hash 从画布移除节点渲染（保留红黑树缓存），供侧边栏「隐藏」父/子节点 */
    removeStructNode: (hash: string) => void
    /** 当前选中节点的数据（单选时取第一个），供侧边栏展示元素信息 */
    selectedNodeData: Ref<StructNodeData | null>
    /** 画布上所有节点的 id（hash）列表，供侧边栏同步眼睛显隐初值 */
    canvasNodeIds: ComputedRef<string[]>
}

/** Canvas 页面的组合式函数：基于 Vue Flow 的节点编辑器 */
export function useCanvasView(): CanvasViewApi {
    const nodes = ref([]) as Ref<Node[]>
    const edges = ref([]) as Ref<Edge[]>
    const { fitView } = useVueFlow()

    /** 已动态新增的节点数：用于错开新节点位置，避免相互重叠 */
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

    /** 节点选中状态变化时的触发逻辑：高亮关联连线并同步选中节点数据给侧边栏 */
    function handleSelectionChange(selectedNodes: Node[]): void {
        // 高亮与选中节点相连的连线：
        // - 选中节点作为 target（连线来自父节点）→ 紫色
        // - 选中节点作为 source（连线指向子节点）→ 蓝色
        // - 高亮连线统一加粗到 SELECTED_EDGE_WIDTH，其余恢复默认灰色与默认线宽
        const selectedIds = new Set(selectedNodes.map((node) => node.id))
        edges.value = edges.value.map((edge) => {
            let stroke = EDGE_STYLE.stroke
            let strokeWidth = EDGE_STYLE.strokeWidth
            if (selectedIds.has(edge.target)) {
                // 选中节点是 target → source 是其父节点 → 紫色加粗
                stroke = SELECTED_EDGE_COLOR_PARENT
                strokeWidth = SELECTED_EDGE_WIDTH
            } else if (selectedIds.has(edge.source)) {
                // 选中节点是 source → target 是其子节点 → 蓝色加粗
                stroke = SELECTED_EDGE_COLOR_CHILD
                strokeWidth = SELECTED_EDGE_WIDTH
            }
            return { ...edge, style: { ...EDGE_STYLE, stroke, strokeWidth } }
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
        // 正向：新节点字段 → 已存在的子节点
        const children = data.childHashes ?? []
        children.forEach((childHash, fieldIndex) => {
            if (childHash && childHash !== hash && existingIds.has(childHash)) {
                pushEdge(
                    createStructEdge(
                        `e-${hash}-f${fieldIndex}-${childHash}`,
                        hash,
                        fieldIndex,
                        childHash
                    )
                )
            }
        })
        // 反向：已存在节点的字段 → 新节点
        for (const node of nodes.value) {
            if (node.id === hash) continue
            const nodeData = node.data as StructNodeData | undefined
            const nodeChildren = nodeData?.childHashes ?? []
            nodeChildren.forEach((childHash, fieldIndex) => {
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
            })
        }
        return result
    }

    /**
     * 依据主进程 query-node 返回的记录在画布新增结构体卡片节点：
     * 解析 ui_json（画布格式 StructNodeData）→ 以 hash 为节点 id 去重 → 追加到 nodes →
     * 与画布上已存在的相关节点自动连线 → 重新 fitView 使新节点进入视野。
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
            data = JSON.parse(record.ui_json) as StructNodeData
        } catch (err) {
            console.error('[canvas] 解析节点 ui_json 失败:', err)
            return
        }
        // 简单网格布局：画布初始为空，新节点从左上角起按 4 列错位排布，避免相互重叠
        const x = 40 + (addedNodeCount % 4) * 300
        const y = 40 + Math.floor(addedNodeCount / 4) * 240
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
        // 下一帧重新适配视图，确保新增节点可见
        void nextTick(() => {
            try {
                fitView({ padding: 0.3, duration: 300 })
            } catch (err) {
                console.warn('[canvas] fitView 失败:', err)
            }
        })
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

    return {
        nodes,
        edges,
        nodeTypes,
        backgroundGap,
        dotSize,
        handleViewportChange,
        addStructNode,
        removeStructNode,
        selectedNodeData,
        canvasNodeIds
    }
}
