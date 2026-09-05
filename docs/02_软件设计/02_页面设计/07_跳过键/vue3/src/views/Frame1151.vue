<template>
    <div class="scroll-container">
        <div
            id="11_51"
            class="debug_button-frame-11_51 pixso-relative-no-shrink pixso-bg-transparent"
        >
            <div
                id="11_57"
                class="debug_button-frame-11_57 pixso-flex-auto-size"
            >
                <div
                    id="11_62"
                    class="debug_button-vector-11_62 pixso-relative-no-shrink"
                ></div>
            </div>
        </div>
    </div>
</template>
<script lang="ts" setup></script>
<style>
.scroll-container {
    height: 100%;
    width: 100%;
    overflow: auto;
}

.debug_button-frame-11_51 {
    width: 100%;
    height: 60px;
    mix-blend-mode: normal;
}

.debug_button-frame-11_57 {
    overflow: hidden;
    position: absolute;
    left: 0%;
    right: 0%;
    top: 0%;
    bottom: 0%;
    flex-direction: row;
    gap: 10px;
    justify-content: center;
    align-items: center;
    padding: 14px 14px 14px 14px;
    border-radius: 10px 10px 10px 10px;
    background-color: rgba(151, 71, 255, 0.3);
    mix-blend-mode: normal;
}

.debug_button-vector-11_62 {
    width: 32px;
    height: 32px;
    background-image: url(@/assets/images/arrowrightcircle.svg);
    background-size: 100% 100%;
    background-repeat: no-repeat;
}
</style>
