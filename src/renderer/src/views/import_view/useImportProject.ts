import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

/** 导入项目页的组合式函数：画布自适应缩放 + 文件选择/拖入 */
export function useImportProject() {
        const canvasWrapper = ref<HTMLElement | null>(null)
        const scale = ref(1)
        const isDragOver = ref(false)
        let lastDropTime = 0
        let observer: ResizeObserver | null = null

        function updateScale(): void {
                if (!canvasWrapper.value) return
                const w = canvasWrapper.value.clientWidth
                const h = canvasWrapper.value.clientHeight
                scale.value = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT)
        }

        onMounted(() => {
                updateScale()
                if (canvasWrapper.value) {
                        observer = new ResizeObserver(updateScale)
                        observer.observe(canvasWrapper.value)
                }
        })

        onUnmounted(() => {
                observer?.disconnect()
        })

        async function handleSelectFile(): Promise<void> {
                // 拖拽松手后短时间内忽略 click 事件，避免重复触发
                if (Date.now() - lastDropTime < 500) return
                const filePath = await window.electron.ipcRenderer.invoke('select-project-file')
                if (filePath) {
                        console.log('[FileSelect] Selected:', filePath)
                } else {
                        console.log('[FileSelect] Cancelled')
                }
        }

        function handleDrop(event: DragEvent): void {
                isDragOver.value = false
                lastDropTime = Date.now()
                const files = event.dataTransfer?.files
                if (!files || files.length === 0) {
                        console.warn('[FileDrop] 未接收到文件，WSL2 环境下拖拽可能不受支持，请使用点击选择')
                        return
                }
                // 通过 preload 桥接的 webUtils 获取真实路径（兼容上下文隔离）
                const filePath = window.api.getPathForFile(files[0])
                console.log('[FileDrop] Dropped:', filePath)
        }

        const router = useRouter()

        function handleNavigateToLoading(): void {
                router.push('/loading')
        }

        return {
                canvasWrapper,
                scale,
                isDragOver,
                handleSelectFile,
                handleDrop,
                handleNavigateToLoading
        }
}
