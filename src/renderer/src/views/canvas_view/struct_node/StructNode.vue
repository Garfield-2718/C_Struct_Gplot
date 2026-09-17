<template>
    <div class="struct-node" :style="{ width: `${data.width}px` }">
        <div class="struct-node-header" :class="`struct-node-header-${headerKind}`">
            <!-- 标题栏左右各一个入线吸附点：编辑模式下可把连线目标端拖到另一侧 -->
            <Handle
                id="header-left"
                type="target"
                :position="Position.Left"
                class="struct-node-target-handle"
            />
            <Handle
                id="header-right"
                type="target"
                :position="Position.Right"
                class="struct-node-target-handle struct-node-target-handle-right"
            />
            <span class="struct-node-title">{{ data.title }}</span>
        </div>
        <template v-if="data.collapsed">
            <div class="struct-node-row struct-node-row-collapsed">......</div>
        </template>
        <template v-else>
            <div
                v-for="(field, index) in data.fields ?? []"
                :key="index"
                class="struct-node-row"
                :class="{ 'struct-node-row-striped': index % 2 === 0 }"
            >
                <!-- 字段行左右各一个出线吸附点：编辑模式下可把连线源端拖到另一侧 -->
                <Handle
                    :id="`field-${index}-left`"
                    type="source"
                    :position="Position.Left"
                    class="struct-node-source-handle"
                />
                <Handle
                    :id="`field-${index}-right`"
                    type="source"
                    :position="Position.Right"
                    class="struct-node-source-handle"
                />
                <span class="struct-node-field">{{ field }}</span>
            </div>
        </template>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import type { StructNodeData } from '../useCanvasView'
import './StructNode.css'

const props = defineProps<NodeProps<StructNodeData>>()

/** 标题栏颜色种类：折叠节点统一为紫色，其余按元素类型 */
const headerKind = computed(() => (props.data.collapsed ? 'collapsed' : props.data.kind))
</script>
