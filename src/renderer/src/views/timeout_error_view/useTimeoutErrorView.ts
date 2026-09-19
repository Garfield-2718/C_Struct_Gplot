import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { ProcessProjectResult } from '../../../../shared/errors'

/** useTimeoutErrorView 对模板暴露的接口；显式声明以满足 explicit-function-return-type 规则 */
export interface TimeoutErrorViewApi {
    timeoutInfoText: ComputedRef<string>
    detail: ComputedRef<string>
    handleBack: () => void
    handleRetry: () => Promise<void>
}

/**
 * 超时错误页的组合式函数：
 * 从路由 query 中读取由导入页在检测到 CLI_TIMEOUT 时携带的上下文
 * （timeout 毫秒数、原始诊断 detail、原文件路径 filePath），
 * 提供人类可读的超时描述与「返回 / 重试」两种恢复动作。
 * 重试直接以同一 filePath 再次调用 process-project-file，
 * 与导入页共用 loading → canvas / timeout / 导入页 的跳转约定。
 */
export function useTimeoutErrorView(): TimeoutErrorViewApi {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n({ useScope: 'global' })

    /** query 值在 vue-router 中可能是数组，统一取首元素后再解析 */
    function readQuery(key: string): string {
        const raw = route.query[key]
        const value = Array.isArray(raw) ? raw[0] : raw
        return typeof value === 'string' ? value : ''
    }

    /** CLI 超时时长（毫秒）；无效或缺失时为 null，UI 会隐藏对应描述行 */
    const timeoutMs = computed<number | null>(() => {
        const parsed = Number(readQuery('timeout'))
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    })

    /** 人类可读的超时描述，例如「3600000 毫秒（约 60 分钟）」；缺参时返回空串 */
    const timeoutInfoText = computed<string>(() => {
        const ms = timeoutMs.value
        if (ms === null) return ''
        const minutes = Math.round(ms / 60000)
        return t('timeout.timeoutInfo', { ms, minutes })
    })

    /** 原始技术详情，按原样保留不参与翻译；空串时模板会隐藏 <details> */
    const detail = computed<string>(() => readQuery('detail'))

    /** 触发本次超时的项目文件路径，用于「重试」直接复用；缺失时重试降级为返回导入页 */
    const filePath = computed<string>(() => readQuery('filePath'))

    /** 返回导入页；用 replace 避免超时页留在历史栈中被回退再次命中 */
    function handleBack(): void {
        router.replace('/')
    }

    /**
     * 重试：若保留了原文件路径则直接再次调用主进程处理并跳回 loading 页；
     * 结果分支与 useImportProject.handleSelectFile 对齐——成功进画布、
     * 再次超时回到本页并刷新 query、其它失败退回导入页。
     */
    async function handleRetry(): Promise<void> {
        const path = filePath.value
        if (!path) {
            router.replace('/')
            return
        }
        router.replace('/loading')
        const processing = window.electron.ipcRenderer.invoke('process-project-file', path)
        const result = (await processing) as ProcessProjectResult | undefined
        if (result?.status === 'success') {
            router.replace('/canvas')
            return
        }
        if (result?.status === 'failure' && result.error?.code === 'CLI_TIMEOUT') {
            const timeout = result.error.params?.timeout
            router.replace({
                path: '/timeout',
                query: {
                    ...(typeof timeout === 'number' || typeof timeout === 'string'
                        ? { timeout: String(timeout) }
                        : {}),
                    ...(result.error.detail ? { detail: result.error.detail } : {}),
                    filePath: path
                }
            })
            return
        }
        router.replace('/')
    }

    return {
        timeoutInfoText,
        detail,
        handleBack,
        handleRetry
    }
}
