<template>
    <Teleport to="body">
        <div v-if="visible" class="errp-overlay" @click.self="handleClose">
            <div
                class="errp-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="errp-title"
                aria-describedby="errp-message"
            >
                <div class="errp-header">
                    <svg
                        class="errp-icon"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7.5v5.5" />
                        <path d="M12 16.5h.01" />
                    </svg>
                    <span id="errp-title" class="errp-title">{{ title }}</span>
                </div>
                <p id="errp-message" class="errp-message">{{ message }}</p>
                <div class="errp-actions">
                    <button
                        ref="confirmButtonRef"
                        type="button"
                        class="errp-button errp-button-primary"
                        @click="handleClose"
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import './ErrorPrompt.css'

const props = withDefaults(
    defineProps<{
        /** 是否显示错误提示弹窗 */
        visible: boolean
        /** 错误详情文本（支持多行，长文本自动折行） */
        message: string
        /** 弹窗标题，默认「操作失败」 */
        title?: string
    }>(),
    { title: '操作失败' }
)

const emit = defineEmits<{ (e: 'close'): void }>()

/** 「确定」按键引用：弹窗显示时自动聚焦，便于回车/空格直接关闭 */
const confirmButtonRef = ref<HTMLButtonElement | null>(null)

function handleClose(): void {
    emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') handleClose()
}

// 显示时自动聚焦确认键并监听 Esc 关闭；隐藏时移除监听，避免残留全局事件
watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            void nextTick(() => confirmButtonRef.value?.focus())
            window.addEventListener('keydown', handleKeydown)
        } else {
            window.removeEventListener('keydown', handleKeydown)
        }
    }
)

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
})
</script>
