# .

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### CLI Sidecar & Distribution

`dist:*` 会先用 PyInstaller 构建 CLI 单文件二进制到 `binaries/<platform>/`，再执行 `npm run build` 与 `electron-builder` 打包。

```bash
# 仅构建 CLI sidecar 二进制（按宿主平台自动选择 windows-x64 / linux-x64）
$ npm run build:cli

# 构建 CLI + 应用 + 打包 Windows 安装包
$ npm run dist:win

# 构建 CLI + 应用 + 打包 Linux 安装包
$ npm run dist:linux
```

> **注意**：`dist:*` 必须在**目标平台本机**执行——PyInstaller 不能交叉编译，在 Linux 上无法产出 Windows 的 `struct_topology.exe`。`build-cli.mjs` 提供 `--target <win|linux|mac>` 校验，目标平台与宿主平台不一致时会立即报错退出，避免打出缺少 CLI 二进制的安装包。
