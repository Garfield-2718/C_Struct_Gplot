import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Edge, GraphNode, Node, NodeTypesObject, ViewportTransform } from '@vue-flow/core'
import StructNode from './struct_node/StructNode.vue'

/** 自定义节点类型注册：struct 卡片节点 */
const nodeTypes: NodeTypesObject = { struct: StructNode }

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
}

/** 连线样式：与 SVG 一致的灰色曲线，无箭头 */
const EDGE_STYLE = { stroke: '#999999', strokeWidth: 1.5 }

/** 选中元素关联连线的颜色：指向选中元素及由其指出的连线高亮为蓝色 */
const SELECTED_EDGE_COLOR = '#2563eb'

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

/** 初始节点：struct_mesh_leaf.svg 中的 14 张结构体卡片 */
const initialNodes: Node[] = [
        // 左列：根结构体
        createStructNode('mesh_core_left', 65, 25, {
                title: 'struct mesh_core',
                kind: 'struct',
                width: 185,
                fields: ['struct mesh_leaf leaf', 'union mesh_hub hub', 'enum mesh_state state']
        }),
        createStructNode('mesh_root_a', 33, 159, {
                title: 'struct mesh_root_a',
                kind: 'struct',
                width: 217,
                fields: [
                        'struct mesh_core core',
                        'union mesh_hub hub',
                        'struct mesh_leaf leaf',
                        'enum mesh_state state',
                        'union mesh_root_b *peer_b'
                ]
        }),
        createStructNode('mesh_hub_left', 25, 345, {
                title: 'union mesh_hub',
                kind: 'union',
                width: 225,
                fields: [
                        'struct mesh_leaf leaf',
                        'enum mesh_state state',
                        'struct mesh_core *core_ptr',
                        'int raw'
                ]
        }),
        createStructNode('mesh_root_b', 25, 505, {
                title: 'union mesh_root_b',
                kind: 'union',
                width: 225,
                fields: [
                        'struct mesh_core core',
                        'struct mesh_leaf leaf',
                        'enum mesh_state state',
                        'struct mesh_root_a *peer_a'
                ]
        }),
        // 中列：展开的叶子节点及其成员类型
        createStructNode('mesh_leaf', 350, 278, {
                title: 'struct mesh_leaf (b0e19e)',
                kind: 'struct',
                width: 225,
                fields: [
                        'enum mesh_state state',
                        'struct mesh_core *core_ptr',
                        'union mesh_hub *hub_ptr'
                ]
        }),
        createStructNode('mesh_state_full', 675, 32, {
                title: 'enum mesh_state (6e56ad)',
                kind: 'enum',
                width: 209,
                fields: ['MESH_IDLE', 'MESH_BUSY', 'MESH_DONE']
        }),
        createStructNode('mesh_core_full', 675, 222, {
                title: 'struct mesh_core (525225)',
                kind: 'struct',
                width: 217,
                fields: ['struct mesh_leaf leaf', 'union mesh_hub hub', 'enum mesh_state state']
        }),
        createStructNode('mesh_hub_full', 675, 455, {
                title: 'union mesh_hub (4229e7)',
                kind: 'union',
                width: 225,
                fields: [
                        'struct mesh_leaf leaf',
                        'enum mesh_state state',
                        'struct mesh_core *core_ptr',
                        'int raw'
                ]
        }),
        // 右列：折叠节点（防止循环引用无限展开）
        createStructNode('mesh_leaf_collapsed_1', 992, 166, {
                title: 'struct mesh_leaf (b0e19e)',
                kind: 'struct',
                width: 217,
                collapsed: true
        }),
        createStructNode('mesh_hub_collapsed_1', 992, 248, {
                title: 'union mesh_hub (4229e7)',
                kind: 'union',
                width: 201,
                collapsed: true
        }),
        createStructNode('mesh_state_collapsed_1', 992, 330, {
                title: 'enum mesh_state (6e56ad)',
                kind: 'enum',
                width: 209,
                collapsed: true
        }),
        createStructNode('mesh_leaf_collapsed_2', 1000, 412, {
                title: 'struct mesh_leaf (b0e19e)',
                kind: 'struct',
                width: 217,
                collapsed: true
        }),
        createStructNode('mesh_state_collapsed_2', 1000, 494, {
                title: 'enum mesh_state (6e56ad)',
                kind: 'enum',
                width: 209,
                collapsed: true
        }),
        createStructNode('mesh_core_collapsed', 1000, 576, {
                title: 'struct mesh_core (525225)',
                kind: 'struct',
                width: 217,
                collapsed: true
        })
]

/** 初始连线：字段行 → 目标类型卡片，与 SVG 中的 13 条曲线一一对应 */
const initialEdges: Edge[] = [
        // 左列各根结构体的 leaf 字段 → mesh_leaf
        createStructEdge('e-core_left-leaf', 'mesh_core_left', 0, 'mesh_leaf'),
        createStructEdge('e-root_a-leaf', 'mesh_root_a', 2, 'mesh_leaf'),
        createStructEdge('e-hub_left-leaf', 'mesh_hub_left', 0, 'mesh_leaf'),
        createStructEdge('e-root_b-leaf', 'mesh_root_b', 1, 'mesh_leaf'),
        // mesh_leaf 各字段 → 展开的成员类型
        createStructEdge('e-leaf-state', 'mesh_leaf', 0, 'mesh_state_full'),
        createStructEdge('e-leaf-core_ptr', 'mesh_leaf', 1, 'mesh_core_full'),
        createStructEdge('e-leaf-hub_ptr', 'mesh_leaf', 2, 'mesh_hub_full'),
        // mesh_core 各字段 → 折叠节点
        createStructEdge('e-core-leaf', 'mesh_core_full', 0, 'mesh_leaf_collapsed_1'),
        createStructEdge('e-core-hub', 'mesh_core_full', 1, 'mesh_hub_collapsed_1'),
        createStructEdge('e-core-state', 'mesh_core_full', 2, 'mesh_state_collapsed_1'),
        // mesh_hub 各字段 → 折叠节点
        createStructEdge('e-hub-leaf', 'mesh_hub_full', 0, 'mesh_leaf_collapsed_2'),
        createStructEdge('e-hub-state', 'mesh_hub_full', 1, 'mesh_state_collapsed_2'),
        createStructEdge('e-hub-core_ptr', 'mesh_hub_full', 2, 'mesh_core_collapsed')
]

/** useCanvasView 的返回结构 */
interface CanvasViewApi {
        nodes: Ref<Node[]>
        edges: Ref<Edge[]>
        nodeTypes: NodeTypesObject
        backgroundGap: Ref<number>
        dotSize: Ref<number>
        handleViewportChange: (viewport: ViewportTransform) => void
        handleNavigateToLoading: () => void
}

/** Canvas 页面的组合式函数：基于 Vue Flow 的节点编辑器 */
export function useCanvasView(): CanvasViewApi {
        const nodes = ref(initialNodes) as Ref<Node[]>
        const edges = ref(initialEdges) as Ref<Edge[]>

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

        /** 节点选中状态变化时的触发逻辑（打桩）：后续在此实现选中后的实际业务，如展示元素详情、联动侧边栏 */
        function handleSelectionChange(selectedNodes: Node[]): void {
                // 高亮与选中节点相连的连线：连入选中节点或从选中节点连出的线变蓝，其余恢复默认灰色
                const selectedIds = new Set(selectedNodes.map((node) => node.id))
                edges.value = edges.value.map((edge) => {
                        const isRelated =
                                selectedIds.has(edge.source) || selectedIds.has(edge.target)
                        const stroke = isRelated ? SELECTED_EDGE_COLOR : EDGE_STYLE.stroke
                        return { ...edge, style: { ...EDGE_STYLE, stroke } }
                })

                // TODO: 替换打桩实现，根据 selectedNodes 触发实际业务逻辑
                console.log(
                        '[canvas] 选中节点:',
                        selectedNodes.map((node) => node.id)
                )
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
                () =>
                        handleSelectionChange(
                                nodes.value.filter((node) => (node as GraphNode).selected)
                        )
        )

        const router = useRouter()

        function handleNavigateToLoading(): void {
                router.push('/loading')
        }

        return {
                nodes,
                edges,
                nodeTypes,
                backgroundGap,
                dotSize,
                handleViewportChange,
                handleNavigateToLoading
        }
}
