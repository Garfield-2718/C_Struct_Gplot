<template>
    <div class="debug-button-wrapper">
        <div class="debug-button-body" @click="handleClick">
            <div class="debug-button-icon">
                <span class="debug-button-arrow"></span>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import './DebugButton.css'

const emit = defineEmits<{
    (e: 'click'): void
}>()

function handleClick(): void {
    emit('click')
}
</script>
