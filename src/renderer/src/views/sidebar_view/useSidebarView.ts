import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

/** 侧边栏宽度允许的范围（px） */
const MIN_SIDEBAR_WIDTH = 160
const MAX_SIDEBAR_WIDTH = 640
/** 侧边栏初始宽度（px） */
const DEFAULT_SIDEBAR_WIDTH = 280
/** 拖拽热区宽度（px）：手柄覆盖侧边栏右缘一小段区域 */
const HANDLE_SIZE = 8

/** 分段内容区高度允许的范围（px） */
const MIN_SECTION_HEIGHT = 48
const MAX_SECTION_HEIGHT = 400

/** 分段状态：支持点击标题栏折叠/展开，拖动底边框调节内容区高度 */
export interface SidebarSectionState {
        /** 是否折叠 */
        collapsed: boolean
        /** 展开时内容区高度（px） */
        height: number
}

/** 元素信息行：描述当前选中元素的键值对 */
export interface SidebarInfoRow {
        key: string
        value: string
}

/** 节点信息行：父/子节点列表中每个节点占一行 */
export interface SidebarNodeRow {
        id: string
        /** 节点显示名称，如 'struct mesh_core' */
        label: string
        /** 行是否可见，由行侧类 PS 的隐藏/显示按键切换 */
        visible: boolean
}

/** 元素信息：当前选中元素的属性（暂用固定示例值） */
const elementInfoRows: SidebarInfoRow[] = [
        { key: '名称', value: 'struct mesh_leaf' },
        { key: '类型', value: 'struct' },
        { key: '地址', value: 'b0e19e' },
        { key: '字段数', value: '3' }
]

/** 父节点信息：引用当前元素的结构体列表（暂用固定示例值） */
const parentNodeRows: SidebarNodeRow[] = [
        { id: 'parent-mesh_core', label: 'struct mesh_core', visible: true },
        { id: 'parent-mesh_root_a', label: 'struct mesh_root_a', visible: true },
        { id: 'parent-mesh_hub', label: 'union mesh_hub', visible: false }
]

/** 子节点信息：当前元素字段引用的类型列表（暂用固定示例值） */
const childNodeRows: SidebarNodeRow[] = [
        { id: 'child-mesh_state', label: 'enum mesh_state', visible: true },
        { id: 'child-mesh_core_ptr', label: 'struct mesh_core *core_ptr', visible: true },
        { id: 'child-mesh_hub_ptr', label: 'union mesh_hub *hub_ptr', visible: true }
]

/** useSidebarView 的返回结构 */
interface SidebarViewApi {
        sidebarWidth: Ref<number>
        handleRight: ComputedRef<number>
        elementInfoRows: SidebarInfoRow[]
        parentNodes: SidebarNodeRow[]
        childNodes: SidebarNodeRow[]
        sectionStates: Record<'elementInfo' | 'parentNodes' | 'childNodes', SidebarSectionState>
        handleStartResize: (event: MouseEvent) => void
        handleToggleRowVisible: (row: SidebarNodeRow) => void
        handleToggleSection: (section: SidebarSectionState) => void
        handleStartResizeSection: (section: SidebarSectionState, event: MouseEvent) => void
}

/** 侧边栏的组合式函数：鼠标按住右缘手柄拖动调节宽度 */
export function useSidebarView(): SidebarViewApi {
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

        /** 三段初始状态：默认展开，高度按行数预留（行高 28px） */
        const sectionStates = reactive({
                elementInfo: { collapsed: false, height: 112 },
                parentNodes: { collapsed: false, height: 96 },
                childNodes: { collapsed: false, height: 96 }
        })

        /** 点击标题栏切换分段折叠/展开 */
        function handleToggleSection(section: SidebarSectionState): void {
                section.collapsed = !section.collapsed
        }

        /** 分段高度拖拽上下文：目标分段与按下时的起点快照 */
        let sectionResizeTarget: SidebarSectionState | null = null
        let sectionResizeStartY = 0
        let sectionResizeStartHeight = 0

        function handleSectionMouseMove(event: MouseEvent): void {
                if (!sectionResizeTarget) return
                // 分段自上而下排列，向下拖动（位移为正）时高度增大
                const delta = event.clientY - sectionResizeStartY
                const next = sectionResizeStartHeight + delta
                sectionResizeTarget.height = Math.min(
                        MAX_SECTION_HEIGHT,
                        Math.max(MIN_SECTION_HEIGHT, next)
                )
        }

        function handleSectionMouseUp(): void {
                sectionResizeTarget = null
                window.removeEventListener('mousemove', handleSectionMouseMove)
                window.removeEventListener('mouseup', handleSectionMouseUp)
        }

        /** 按住分段底边框开始拖拽调节高度 */
        function handleStartResizeSection(section: SidebarSectionState, event: MouseEvent): void {
                event.preventDefault()
                sectionResizeTarget = section
                sectionResizeStartY = event.clientY
                sectionResizeStartHeight = section.height
                window.addEventListener('mousemove', handleSectionMouseMove)
                window.addEventListener('mouseup', handleSectionMouseUp)
        }

        onBeforeUnmount(handleSectionMouseUp)

        /** 父/子节点列表：reactive 包裹以支持行显隐状态切换 */
        const nodeSections = reactive({
                parentNodes: parentNodeRows,
                childNodes: childNodeRows
        })

        /** 切换行显隐：对应行侧类 PS 的隐藏/显示按键 */
        function handleToggleRowVisible(row: SidebarNodeRow): void {
                row.visible = !row.visible
        }

        return {
                sidebarWidth,
                handleRight,
                elementInfoRows,
                parentNodes: nodeSections.parentNodes,
                childNodes: nodeSections.childNodes,
                sectionStates,
                handleStartResize,
                handleToggleRowVisible,
                handleToggleSection,
                handleStartResizeSection
        }
}
