<template>
    <div
        class="sidebar-panel"
        :style="{
            '--sidebar-width': `${sidebarWidth}px`,
            '--sidebar-handle-right': `${handleRight}px`,
            '--element-info-height': toMaxHeightCss(sectionStates.elementInfo.height),
            '--parent-nodes-height': toMaxHeightCss(sectionStates.parentNodes.height),
            '--child-nodes-height': toMaxHeightCss(sectionStates.childNodes.height)
        }"
    >
        <div class="sidebar-content">
            <!-- 第一段：元素信息（键值对展示当前选中元素） -->
            <section class="sidebar-section">
                <header
                    class="sidebar-section-header"
                    :title="t('sidebar.toggleSection')"
                    @click="handleToggleSection(sectionStates.elementInfo)"
                >
                    <span
                        class="sidebar-collapse-arrow"
                        :class="{
                            'is-collapsed': sectionStates.elementInfo.collapsed
                        }"
                    ></span>
                    <h2 class="sidebar-section-title">{{ t('sidebar.elementInfo') }}</h2>
                </header>
                <Transition name="sidebar-collapse">
                    <div
                        v-show="!sectionStates.elementInfo.collapsed && elementInfoRows.length > 0"
                        class="sidebar-section-body sidebar-section-body--element-info"
                    >
                        <ul class="sidebar-info-list">
                            <li
                                v-for="row in elementInfoRows"
                                :key="row.key"
                                class="sidebar-info-row"
                            >
                                <span class="sidebar-info-key">{{ t(row.key) }}</span>
                                <!-- 名称行：结构体名前的小眼睛，控制当前选中元素在画布上的显隐 -->
                                <button
                                    v-if="row.visibilityToggle"
                                    class="sidebar-visibility-toggle"
                                    :class="{ 'is-off': !selectedNodeVisible }"
                                    :title="
                                        t(
                                            selectedNodeVisible
                                                ? 'sidebar.hideElement'
                                                : 'sidebar.showElement'
                                        )
                                    "
                                    :aria-label="
                                        t(selectedNodeVisible ? 'a11y.hideNode' : 'a11y.showNode', {
                                            name: row.value
                                        })
                                    "
                                    @click="handleToggleSelectedVisible"
                                >
                                    <span class="sidebar-eye-icon"></span>
                                </button>
                                <span class="sidebar-info-value">{{ row.value }}</span>
                            </li>
                        </ul>
                    </div>
                </Transition>
                <Transition name="sidebar-collapse">
                    <div
                        v-show="!sectionStates.elementInfo.collapsed && elementInfoRows.length > 0"
                        class="sidebar-section-resizer"
                        :title="t('sidebar.resizeSection')"
                        @mousedown="handleStartResizeSection(sectionStates.elementInfo, $event)"
                    ></div>
                </Transition>
            </section>
            <!-- 第二段：父节点信息（每个节点占一行，行侧带显隐按键） -->
            <section class="sidebar-section">
                <header
                    class="sidebar-section-header"
                    :title="t('sidebar.toggleSection')"
                    @click="handleToggleSection(sectionStates.parentNodes)"
                >
                    <span
                        class="sidebar-collapse-arrow"
                        :class="{
                            'is-collapsed': sectionStates.parentNodes.collapsed
                        }"
                    ></span>
                    <h2 class="sidebar-section-title">{{ t('sidebar.parentNodes') }}</h2>
                </header>
                <Transition name="sidebar-collapse">
                    <div
                        v-show="!sectionStates.parentNodes.collapsed && parentNodes.length > 0"
                        class="sidebar-section-body sidebar-section-body--parent-nodes"
                    >
                        <ul class="sidebar-node-list">
                            <li
                                v-for="row in parentNodes"
                                :key="row.id"
                                class="sidebar-node-row"
                                :class="{
                                    'is-hidden': !row.visible
                                }"
                            >
                                <button
                                    class="sidebar-visibility-toggle"
                                    :class="{
                                        'is-off': !row.visible
                                    }"
                                    :title="t(row.visible ? 'sidebar.hideRow' : 'sidebar.showRow')"
                                    :aria-label="
                                        t(row.visible ? 'a11y.hideNode' : 'a11y.showNode', {
                                            name: row.label
                                        })
                                    "
                                    @click="handleToggleRowVisible(row)"
                                >
                                    <span class="sidebar-eye-icon"></span>
                                </button>
                                <span class="sidebar-node-label">{{ row.label }}</span>
                            </li>
                        </ul>
                    </div>
                </Transition>
                <Transition name="sidebar-collapse">
                    <div
                        v-show="!sectionStates.parentNodes.collapsed && parentNodes.length > 0"
                        class="sidebar-section-resizer"
                        :title="t('sidebar.resizeSection')"
                        @mousedown="handleStartResizeSection(sectionStates.parentNodes, $event)"
                    ></div>
                </Transition>
            </section>
            <!-- 第三段：子节点信息（每个节点占一行，行侧带显隐按键） -->
            <section class="sidebar-section">
                <header
                    class="sidebar-section-header"
                    :title="t('sidebar.toggleSection')"
                    @click="handleToggleSection(sectionStates.childNodes)"
                >
                    <span
                        class="sidebar-collapse-arrow"
                        :class="{
                            'is-collapsed': sectionStates.childNodes.collapsed
                        }"
                    ></span>
                    <h2 class="sidebar-section-title">{{ t('sidebar.childNodes') }}</h2>
                </header>
                <Transition name="sidebar-collapse">
                    <div
                        v-show="!sectionStates.childNodes.collapsed && childNodes.length > 0"
                        class="sidebar-section-body sidebar-section-body--child-nodes"
                    >
                        <ul class="sidebar-node-list">
                            <li
                                v-for="row in childNodes"
                                :key="row.id"
                                class="sidebar-node-row"
                                :class="{
                                    'is-hidden': !row.visible
                                }"
                            >
                                <button
                                    class="sidebar-visibility-toggle"
                                    :class="{
                                        'is-off': !row.visible
                                    }"
                                    :title="t(row.visible ? 'sidebar.hideRow' : 'sidebar.showRow')"
                                    :aria-label="
                                        t(row.visible ? 'a11y.hideNode' : 'a11y.showNode', {
                                            name: row.label
                                        })
                                    "
                                    @click="handleToggleRowVisible(row)"
                                >
                                    <span class="sidebar-eye-icon"></span>
                                </button>
                                <span class="sidebar-node-label">{{ row.label }}</span>
                            </li>
                        </ul>
                    </div>
                </Transition>
                <Transition name="sidebar-collapse">
                    <div
                        v-show="!sectionStates.childNodes.collapsed && childNodes.length > 0"
                        class="sidebar-section-resizer"
                        :title="t('sidebar.resizeSection')"
                        @mousedown="handleStartResizeSection(sectionStates.childNodes, $event)"
                    ></div>
                </Transition>
            </section>
        </div>
        <div
            class="sidebar-resize-handle"
            :title="t('a11y.sidebarResize')"
            @mousedown="handleStartResize"
        ></div>
    </div>
</template>

<script lang="ts" setup>
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSidebarView } from './useSidebarView'
import type { StructNodeData, StructNodeRecord } from '@/views/canvas_view/useCanvasView'
import './SidebarView.css'

/** 将 height 数值映射为 CSS `max-height` 可接受的字符串：`null` → `none`（无上限），数值 → `${n}px` */
function toMaxHeightCss(height: number | null): string {
    return height === null ? 'none' : `${height}px`
}

const { t } = useI18n({ useScope: 'global' })
const props = defineProps<{
    selectedNode: StructNodeData | null
    /** 画布上已渲染节点的 id（hash）列表：用于同步父/子节点行的眼睛显隐初值 */
    canvasNodeIds: string[]
}>()

/** 向父级 CanvasView 上报显示/隐藏节点：显示交画布渲染新节点，隐藏交画布移除渲染 */
const emit = defineEmits<{
    (e: 'show-node', record: StructNodeRecord): void
    (e: 'hide-node', hash: string): void
}>()

const {
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
} = useSidebarView(toRef(props, 'selectedNode'), toRef(props, 'canvasNodeIds'), {
    onShowNode: (record) => emit('show-node', record),
    onHideNode: (hash) => emit('hide-node', hash)
})
</script>
