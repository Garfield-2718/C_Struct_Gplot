<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { getBezierPath } from '@vue-flow/core'
import type { EdgeProps } from '@vue-flow/core'

/**
 * 自定义「流动箭头」连线：实心贝塞尔曲线 + 沿路径从起点(source)流向终点(target)的箭头。
 * 箭头以「恒定速度」流动：动画时长 = 路径长度 / FLOW_SPEED，与连线长短无关，长短连线上的箭头一样快。
 * 长连线额外渲染一个错峰（半周期）箭头使流动更连续；短连线只放一个，避免拥挤。
 * 线身与箭头颜色取自 edge.style.stroke（父=紫 / 子=蓝），由 useCanvasView 的选中逻辑设置。
 */
const props = defineProps<EdgeProps>()

/** 箭头恒定流动速度（px/秒）：动画时长随路径长度线性变化，从而速度恒定 */
const FLOW_SPEED = 120
/** 展示第二个错峰箭头所需的最小路径长度（px）：短连线只放一个箭头，避免拥挤 */
const SECOND_ARROW_MIN_LENGTH = 160
/** 动画时长下限（秒）：防止极短连线时箭头过快抖动 */
const MIN_DURATION = 0.4

/** 贝塞尔路径字符串（与默认连线一致）：既作为线身，也作为箭头的运动轨迹 */
const path = computed(
    () =>
        getBezierPath({
            sourceX: props.sourceX,
            sourceY: props.sourceY,
            targetX: props.targetX,
            targetY: props.targetY,
            sourcePosition: props.sourcePosition,
            targetPosition: props.targetPosition
        })[0]
)

/** 箭头填充色：跟随线身颜色，缺省回退到灰色 */
const arrowColor = computed(() => (props.style?.stroke as string | undefined) ?? '#999999')

/** 线身元素引用：用于测量路径真实长度，换算恒定速度所需的动画时长 */
const pathEl = ref<SVGPathElement | null>(null)
/** 路径长度（px），0 表示尚未测量 */
const pathLength = ref(0)

/** 测量当前路径长度：onMounted 首测，path 变化（如拖动节点）后经 nextTick 复测 */
function measurePathLength(): void {
    pathLength.value = pathEl.value?.getTotalLength() ?? 0
}

onMounted(() => void nextTick(measurePathLength))
watch(path, () => void nextTick(measurePathLength))

/** 单程动画时长（秒）= 路径长度 / 速度，实现恒定速度；未测得长度时用兑底值 */
const durationSeconds = computed(() =>
    pathLength.value > 0 ? Math.max(pathLength.value / FLOW_SPEED, MIN_DURATION) : 1.5
)

/** 传给 animateMotion 的 dur，如 "1.667s" */
const duration = computed(() => `${durationSeconds.value.toFixed(3)}s`)

/** 第二个箭头的错峰 begin：负半周期，使其与第一个箭头相隔半个周期均匀分布 */
const staggerBegin = computed(() => `-${(durationSeconds.value / 2).toFixed(3)}s`)

/** 是否渲染第二个错峰箭头：仅长连线需要 */
const showSecondArrow = computed(() => pathLength.value >= SECOND_ARROW_MIN_LENGTH)
</script>

<template>
    <!-- 线身：实心曲线，stroke/strokeWidth 由 edge.style 提供；ref 供测量路径长度 -->
    <path ref="pathEl" class="flow-arrow-edge-path" :d="path" :style="props.style" fill="none" />
    <!-- 流动箭头：三角形沿 path 从起点移动到终点，rotate=auto 使其始终朝向路径前进方向 -->
    <polygon class="flow-arrow-head" :fill="arrowColor" points="-8,-6 8,0 -8,6">
        <animateMotion :dur="duration" repeatCount="indefinite" rotate="auto" :path="path" />
    </polygon>
    <!-- 第二个错峰箭头：仅长连线渲染，begin 为负半周期，与第一个箭头均匀错开、流动更连续 -->
    <polygon
        v-if="showSecondArrow"
        class="flow-arrow-head"
        :fill="arrowColor"
        points="-8,-6 8,0 -8,6"
    >
        <animateMotion
            :dur="duration"
            :begin="staggerBegin"
            repeatCount="indefinite"
            rotate="auto"
            :path="path"
        />
    </polygon>
</template>

<style scoped>
.flow-arrow-edge-path {
    stroke-linecap: round;
}
</style>
