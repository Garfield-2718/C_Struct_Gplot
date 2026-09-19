import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { MessageKey } from '../../../../shared/locales/types'

/** useHelpView 对模板暴露的接口；显式声明以满足 explicit-function-return-type 规则 */
export interface HelpViewApi {
    t: (key: MessageKey) => string
    /** 应用版本号（来自 package.json version） */
    appVersion: Ref<string>
    /** 应用作者 */
    appAuthor: Ref<string>
    /** 项目地址（GitHub 仓库链接） */
    appProjectUrl: Ref<string>
    /** 是否正在加载应用信息 */
    isLoading: Ref<boolean>
    /** 返回上一页 */
    handleBack: () => void
}

/**
 * 帮助页的组合式函数：
 * - 通过 IPC 调用 get-app-info 获取应用元信息（版本/作者/项目地址）；
 * - 提供返回上一页的处理逻辑；
 * - 加载失败时使用占位符回退，不阻塞页面渲染。
 */
export function useHelpView(): HelpViewApi {
    const router = useRouter()
    const { t } = useI18n({ useScope: 'global' })

    /** 应用元信息：初始为占位符，IPC 返回后更新 */
    const appVersion = ref('—')
    const appAuthor = ref('—')
    const appProjectUrl = ref('—')
    const isLoading = ref(true)

    /**
     * 加载应用信息：调用主进程 get-app-info 通道。
     * 失败时保留占位符并记录日志，不影响页面可用性。
     */
    async function loadAppInfo(): Promise<void> {
        try {
            const info = (await window.electron.ipcRenderer.invoke('get-app-info')) as {
                name: string
                version: string
                author: string
                projectUrl: string
            }
            appVersion.value = info.version || appVersion.value
            appAuthor.value = info.author || appAuthor.value
            appProjectUrl.value = info.projectUrl || appProjectUrl.value
        } catch (err) {
            console.error('[help] 加载应用信息失败:', err)
        } finally {
            isLoading.value = false
        }
    }

    onMounted(() => {
        void loadAppInfo()
    })

    /**
     * 返回上一页：优先使用浏览器历史；无历史时（如直接打开帮助页）回退到画布页。
     */
    function handleBack(): void {
        if (window.history.length > 1) {
            router.back()
        } else {
            router.replace('/canvas')
        }
    }

    return {
        t,
        appVersion,
        appAuthor,
        appProjectUrl,
        isLoading,
        handleBack
    }
}
