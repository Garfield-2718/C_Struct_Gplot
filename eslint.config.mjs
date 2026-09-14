import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
    { ignores: ['**/node_modules', '**/dist', '**/out'] },
    tseslint.configs.recommended,
    eslintPluginVue.configs['flat/recommended'],
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                },
                extraFileExtensions: ['.vue'],
                parser: tseslint.parser
            }
        }
    },
    {
        files: ['**/*.{ts,mts,tsx,vue}'],
        rules: {
            'vue/require-default-prop': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/block-lang': [
                'error',
                {
                    script: {
                        lang: 'ts'
                    }
                }
            ]
        }
    },
    {
        // 构建脚本为纯 JS(.mjs),语法上无法书写 TS 类型注解;
        // 因此仅对 scripts 下的 .mjs 关闭 TS 专有的“显式返回类型”规则,
        // 该 override 作用域严格受限,绝不削弱 src/ 等其它 TS 文件的规则强度。
        files: ['scripts/**/*.mjs'],
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off'
        }
    },
    eslintConfigPrettier
)
