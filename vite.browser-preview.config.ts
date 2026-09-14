import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 临时配置：仅用于在普通浏览器中预览渲染器页面（排查画布渲染问题），不参与正式构建
export default defineConfig({
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
        alias: {
            '@renderer': resolve(__dirname, 'src/renderer/src'),
            '@': resolve(__dirname, 'src/renderer/src')
        }
    },
    plugins: [vue()],
    server: {
        port: 5199
    }
})
