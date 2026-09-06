import { ref } from 'vue'
import type { Ref } from 'vue'

/** useBottombarView 的返回结构 */
interface BottombarViewApi {
        collapsed: Ref<boolean>
        handleToggleCollapse: () => void
        handleSelectModeClick: () => void
        handleAddNodeClick: () => void
}

/** 底边栏的组合式函数：工具栏按键与收起/展开状态的处理 */
export function useBottombarView(): BottombarViewApi {
        /** 底边栏是否收起：收起后仅保留顶部的三角手柄 */
        const collapsed = ref(false)

        /** 点击顶部三角手柄切换收起/展开 */
        function handleToggleCollapse(): void {
                collapsed.value = !collapsed.value
        }

        /** 选择模式按键点击的触发逻辑（打桩）：后续在此实现实际业务，如把画布切换为选择模式 */
        function handleSelectModeClick(): void {
                // TODO: 替换打桩实现，联动画布切换到选择模式
                console.log('[bottombar] 点击选择模式按键')
        }

        /** 添加节点按键点击的触发逻辑（打桩）：后续在此实现实际业务，如向画布插入新的结构体卡片 */
        function handleAddNodeClick(): void {
                // TODO: 替换打桩实现，联动画布向 nodes 中添加新节点
                console.log('[bottombar] 点击添加节点按键')
        }

        return { collapsed, handleToggleCollapse, handleSelectModeClick, handleAddNodeClick }
}
