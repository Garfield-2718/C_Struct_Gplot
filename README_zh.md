# C Struct Gplot

[English](./README.md) | 简体中文

基于`Electron` + `Vue` + `TypeScript`的`C`语言项目静态代码分析图形化桌面应用,将[C_Struct_Gplot_CLI](https://github.com/Garfield-2718/C_Struct_Gplot_CLI)解析出的`struct\union\enum`结构关系图展示在可交互画布上,支持缩放,拖拽,节点搜索与图片导出

应用内置[C_Struct_Gplot_CLI](https://github.com/Garfield-2718/C_Struct_Gplot_CLI)静态分析二进制(`struct_topology`)作为sidecar:导入项目即自动解析,选择结构体即可生成拓扑图并渲染到画布

支持简体中文和英文,支持将结构关系图导出为`pdf`,`png`,`svg`,`jpeg`格式

## 依赖环境

- **Node.js**(≥ v22)与**npm**:构建与运行应用始终必需
- **git**,**Python 3**,**PyInstaller**:仅在构建CLI sidecar二进制(`build:cli` / `dist:*`)时需要

详细安装步骤见[docs/03_依赖环境安装.md](./docs/03_依赖环境安装.md)

## 项目构建

### 安装依赖

```shell
npm install
```

### 开发运行

```shell
npm run dev
```

### 构建应用

```shell
# windows平台
npm run build:win

# macOS平台
npm run build:mac

# linux平台
npm run build:linux
```

## CLI Sidecar与打包发行

`dist:*`会先用PyInstaller构建CLI单文件二进制到`binaries/<platform>/`,再执行`npm run build`与`electron-builder`打包安装包

```shell
# 仅构建CLI sidecar二进制(按宿主平台自动选择windows-x64 / linux-x64)
npm run build:cli

# 构建CLI + 应用 + 打包Windows安装包
npm run dist:win

# 构建CLI + 应用 + 打包Linux安装包
npm run dist:linux
```

> **注意**:`dist:*`必须在**目标平台本机**执行——PyInstaller不能交叉编译,在Linux上无法产出Windows的`struct_topology.exe`。`build-cli.mjs`提供`--target <win|linux|mac>`校验,目标平台与宿主平台不一致时会立即报错退出,避免打出缺少CLI二进制的安装包。

## 推荐IDE配置

[VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
