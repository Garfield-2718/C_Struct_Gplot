import './assets/styles/font.css'
import './assets/styles/global.css'
import { createApp } from 'vue'
import './styles.css'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { initializeSettings, provideSettings } from './stores/settings'

/** 首次渲染前同步持久化设置、全局语言、document.lang 与画布配色。 */
async function bootstrap(): Promise<void> {
    await initializeSettings()
    const app = createApp(App)
    provideSettings(app)
    app.use(i18n).use(router).mount('#app')
}

void bootstrap()

declare global {
    interface Window {
        app: any
    }
}
