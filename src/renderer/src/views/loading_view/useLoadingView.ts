import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

/** Loading 页面的组合式函数：画布自适应缩放 */
export function useLoadingView() {
        const canvasWrapper = ref<HTMLElement | null>(null)
        const scale = ref(1)
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

        const router = useRouter()

        function handleNavigateToCanvas(): void {
                router.push('/canvas')
        }

        return {
                canvasWrapper,
                scale,
                handleNavigateToCanvas
        }
}
