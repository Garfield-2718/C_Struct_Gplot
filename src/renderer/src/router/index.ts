import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'ImportProject',
        component: () => import('@/views/import_view/ImportProject.vue'),
        meta: { guid: '2:1' }
    },
    {
        path: '/loading',
        name: 'Loading',
        component: () => import('@/views/loading_view/LoadingView.vue'),
        meta: { guid: '3:40' }
    },
    {
        path: '/canvas',
        name: 'Canvas',
        component: () => import('@/views/canvas_view/CanvasView.vue'),
        meta: { guid: '12:01' }
    },
    {
        path: '/settings',
        name: 'Settings',
        component: () => import('@/views/settings_view/SettingsView.vue'),
        meta: { guid: '13:01' }
    }
]

const routePathMap = new Map<string, string>()

export const getRoutePathByGuid = (guid: string) => {
    if (!guid) return
    if (routePathMap.has(guid)) return routePathMap.get(guid)

    const route = routes.find((item) => item.meta?.guid === guid)
    if (!route) return
    routePathMap.set(guid, route.path)

    return route.path
}

export const router = createRouter({
    history: createWebHashHistory(),
    routes
})
