import { createI18n } from 'vue-i18n'
import { DEFAULT_LOCALE, normalizeLocale } from '../../../shared/settings'
import { messages } from '../../../shared/locales/translate'
import type { MessageSchema } from '../../../shared/locales/types'

/** Composition API + 静态字典；保留现有 CSP，不使用动态代码或远程语言资源。 */
export const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages
})

/** 仅由设置初始化/保存成功路径调用；修改草稿时不得调用。 */
export function setAppLocale(locale: unknown): void {
    const normalized = normalizeLocale(locale)
    i18n.global.locale.value = normalized
    document.documentElement.lang = normalized
}

/** 后续页面 useI18n({ useScope: 'global' }) 可复用同一份消息键提示。 */
declare module 'vue-i18n' {
    export interface DefineLocaleMessage extends MessageSchema {}
}
