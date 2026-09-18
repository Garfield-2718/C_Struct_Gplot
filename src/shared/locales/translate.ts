import { normalizeLocale } from '../settings'
import type { AppLocale } from '../settings'
import { zhCN } from './zh-CN'
import { enUS } from './en-US'
import type { MessageKey, MessageSchema, TranslationParams } from './types'

export type { MessageKey, MessageSchema, TranslationParams } from './types'
export const messages: Record<AppLocale, MessageSchema> = { 'zh-CN': zhCN, 'en-US': enUS }

function lookupMessage(dictionary: MessageSchema, key: string): string | undefined {
    let value: unknown = dictionary
    for (const segment of key.split('.')) {
        if (typeof value !== 'object' || value === null || !Object.hasOwn(value, segment)) {
            return undefined
        }
        value = (value as Record<string, unknown>)[segment]
    }
    return typeof value === 'string' ? value : undefined
}

/**
 * 主进程可用的纯函数翻译：只支持命名插值，不执行代码或 HTML。
 * 不支持复数/链接语法；缺键回退中文再回退键名，缺参数保留占位符。
 * 渲染组件应使用 vue-i18n 的全局 Composer，以响应语言切换。
 */
export function translate(
    locale: unknown,
    key: MessageKey,
    params: TranslationParams = {}
): string {
    const text = lookupMessage(messages[normalizeLocale(locale)], key) ?? lookupMessage(zhCN, key)
    return (text ?? key).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (placeholder, name: string) =>
        Object.hasOwn(params, name) ? String(params[name]) : placeholder
    )
}
