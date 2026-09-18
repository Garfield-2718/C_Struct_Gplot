import {
    computed,
    nextTick,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    onMounted,
    watch
} from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVueFlow } from '@vue-flow/core'
import type { MessageKey } from '../../../../shared/locales/types'

interface CanvasI18nApi {
    minZoomReached: ComputedRef<boolean>
    maxZoomReached: ComputedRef<boolean>
    isInteractive: ComputedRef<boolean>
    zoomIn: () => void
    zoomOut: () => void
    fitView: () => void
    toggleInteractive: () => void
    captureCanvasKeydown: (event: KeyboardEvent) => void
}

const DIRECTION_KEYS: Record<string, MessageKey> = {
    ArrowUp: 'a11y.up',
    ArrowDown: 'a11y.down',
    ArrowLeft: 'a11y.left',
    ArrowRight: 'a11y.right'
}

/**
 * 隔离 core 1.48.2 / controls 1.1.3 的无障碍差异。
 * controls 的四个 control-* 插槽不提供处理函数，因此复用相同的 store API 和边界判断。
 * core 没有统一 locale API：公开 ariaLabel/domAttributes 负责节点/边，
 * 内置说明只在当前画布内按固定 ID 修补；升级 Vue Flow 时须复核这些 ID 和键盘播报时序。
 * 不修改 data、节点关系/位置/选择，也不禁用库自带键盘行为。
 */
export function useCanvasI18n(root: Ref<HTMLElement | null>): CanvasI18nApi {
    const { t, locale } = useI18n({ useScope: 'global' })
    const flow = useVueFlow()
    const isInteractive = computed(
        () =>
            flow.nodesDraggable.value ||
            flow.nodesConnectable.value ||
            flow.elementsSelectable.value
    )
    const minZoomReached = computed(() => flow.viewport.value.zoom <= flow.minZoom.value)
    const maxZoomReached = computed(() => flow.viewport.value.zoom >= flow.maxZoom.value)

    function zoomIn(): void {
        if (!maxZoomReached.value) void flow.zoomIn()
    }

    function zoomOut(): void {
        if (!minZoomReached.value) void flow.zoomOut()
    }

    function fitView(): void {
        void flow.fitView()
    }

    function toggleInteractive(): void {
        flow.setInteractive(!isInteractive.value)
    }

    function nodeName(id: string): string {
        const title: unknown = flow.findNode(id)?.data?.title
        return typeof title === 'string' ? title : id
    }

    function updateElementLabels(): void {
        for (const node of flow.getNodes.value) {
            const label = t('a11y.nodeLabel', { name: nodeName(node.id) })
            const role = t('a11y.node')
            if (node.ariaLabel !== label) node.ariaLabel = label
            if (node.domAttributes?.['aria-roledescription'] !== role) {
                node.domAttributes = { ...node.domAttributes, 'aria-roledescription': role }
            }
        }
        for (const edge of flow.getEdges.value) {
            const label = t('a11y.edgeLabel', {
                source: nodeName(edge.source),
                target: nodeName(edge.target)
            })
            const role = t('a11y.edge')
            if (edge.ariaLabel !== label) edge.ariaLabel = label
            if (edge.domAttributes?.['aria-roledescription'] !== role) {
                edge.domAttributes = { ...edge.domAttributes, 'aria-roledescription': role }
            }
        }
    }

    watch(
        [
            locale,
            () => flow.getNodes.value.map((node) => [node, node.id, node.data?.title]),
            () => flow.getEdges.value.map((edge) => [edge, edge.source, edge.target])
        ],
        updateElementLabels,
        { immediate: true }
    )

    function updateDescriptions(): void {
        const descriptions: Array<[string, string]> = [
            [
                'vue-flow__node-desc',
                t(
                    flow.nodesDraggable.value
                        ? 'a11y.nodeInstructions'
                        : 'a11y.nodeLockedInstructions'
                )
            ],
            [
                'vue-flow__edge-desc',
                t(
                    flow.elementsSelectable.value && flow.edgesFocusable.value
                        ? 'a11y.edgeInstructions'
                        : 'a11y.edgeUnavailableInstructions'
                )
            ]
        ]
        for (const [prefix, text] of descriptions) {
            const element = root.value?.querySelector<HTMLElement>(
                `#${CSS.escape(`${prefix}-${flow.id}`)}`
            )
            if (element && element.textContent !== text) element.textContent = text
        }
    }

    // 仅监听两个说明节点及其所在父节点，不观察整张图的拖拽/连线动画。
    let descriptionObserver: MutationObserver | undefined
    function observeDescriptions(): void {
        descriptionObserver?.disconnect()
        updateDescriptions()
        const nodeDescription = root.value?.querySelector<HTMLElement>(
            `#${CSS.escape(`vue-flow__node-desc-${flow.id}`)}`
        )
        const edgeDescription = root.value?.querySelector<HTMLElement>(
            `#${CSS.escape(`vue-flow__edge-desc-${flow.id}`)}`
        )
        if (!nodeDescription || !edgeDescription) return
        descriptionObserver = new MutationObserver(updateDescriptions)
        for (const description of [nodeDescription, edgeDescription]) {
            descriptionObserver.observe(description, {
                childList: true,
                characterData: true,
                subtree: true
            })
        }
    }

    watch(
        [locale, flow.nodesDraggable, flow.elementsSelectable, flow.edgesFocusable],
        updateDescriptions,
        { flush: 'post' }
    )

    let keyContext: { id: string; direction: MessageKey } | null = null
    let lastMove: { name: string; direction: MessageKey; x: number; y: number } | null = null
    let writingLiveMessage = false
    let moveSequence = 0

    function writeLiveMessage(message: string): void {
        writingLiveMessage = true
        flow.ariaLiveMessage.value = message
        writingLiveMessage = false
    }

    function renderLastMove(): void {
        if (!lastMove) return
        writeLiveMessage(
            t('a11y.movedNode', {
                name: lastMove.name,
                direction: t(lastMove.direction),
                x: lastMove.x,
                y: lastMove.y
            })
        )
    }

    function captureCanvasKeydown(event: KeyboardEvent): void {
        keyContext = null
        const target = event.target
        if (
            !(target instanceof HTMLElement) ||
            target.closest('input, textarea, [contenteditable="true"]')
        )
            return
        const direction = DIRECTION_KEYS[event.key]
        const element = target.closest<HTMLElement>('.vue-flow__node')
        const id = element?.getAttribute('data-id')
        if (!direction || !id || !root.value?.contains(element)) return
        const node = flow.findNode(id)
        if (node?.selected && (node.draggable ?? flow.nodesDraggable.value)) {
            keyContext = { id, direction }
        }
    }

    // core 在方向键处理函数内先写英文、再移动节点。同步拦截写入，
    // 等库应用实际位置（含 Shift/网格/边界）后再播报；不解析任何英文/中文字符串。
    watch(
        flow.ariaLiveMessage,
        (message) => {
            if (writingLiveMessage || !message || !keyContext) return
            const context = keyContext
            keyContext = null
            const sequence = ++moveSequence
            writeLiveMessage('')
            void nextTick(() => {
                if (sequence !== moveSequence) return
                const node = flow.findNode(context.id)
                if (!node) return
                lastMove = {
                    name: nodeName(context.id),
                    direction: context.direction,
                    x: Math.trunc(node.position.x),
                    y: Math.trunc(node.position.y)
                }
                renderLastMove()
            })
        },
        { flush: 'sync' }
    )
    watch(locale, renderLastMove)

    function activate(): void {
        void nextTick(observeDescriptions)
    }

    function deactivate(): void {
        descriptionObserver?.disconnect()
        keyContext = null
        lastMove = null
        moveSequence++
        writeLiveMessage('')
    }

    onMounted(activate)
    onActivated(activate)
    onDeactivated(deactivate)
    onBeforeUnmount(deactivate)

    return {
        minZoomReached,
        maxZoomReached,
        isInteractive,
        zoomIn,
        zoomOut,
        fitView,
        toggleInteractive,
        captureCanvasKeydown
    }
}
