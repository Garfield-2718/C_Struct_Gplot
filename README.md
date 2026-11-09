# C Struct Gplot

English | [简体中文](./README_zh.md)

A graphical desktop application for static code analysis of `C` language projects, built with `Electron` + `Vue` + `TypeScript`. It displays the `struct\union\enum` relationship diagram parsed by [C_Struct_Gplot_CLI](https://github.com/Garfield-2718/C_Struct_Gplot_CLI) on an interactive canvas, supporting zoom, drag, node search and diagram export

The application has the [C_Struct_Gplot_CLI](https://github.com/Garfield-2718/C_Struct_Gplot_CLI) static analysis binary (`struct_topology`) built in as a sidecar: import a project and it is parsed automatically, select a structure and the topology diagram is generated and rendered on the canvas

Supports Simplified Chinese and English, and supports exporting the relationship diagram in `pdf`, `png`, `svg` and `jpeg` formats

## Dependency Environment

- **Node.js** (≥ v22) and **npm**: always required for building and running the application
- **git**, **Python 3**, **PyInstaller**: only required when building the CLI sidecar binary (`build:cli` / `dist:*`)

For detailed installation steps, see [docs/03_依赖环境安装.md](./docs/03_依赖环境安装.md)

## Project Setup

### Install

```shell
npm install
```

### Development

```shell
npm run dev
```

### Build

```shell
# For windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## CLI Sidecar & Distribution

`dist:*` first builds the CLI single-file binary into `binaries/<platform>/` via PyInstaller, then runs `npm run build` and packages the installer with `electron-builder`.

```shell
# Build only the CLI sidecar binary (windows-x64 / linux-x64 chosen automatically by host platform)
npm run build:cli

# Build CLI + application + package the Windows installer
npm run dist:win

# Build CLI + application + package the Linux installer
npm run dist:linux
```

> **Note**: `dist:*` must be executed on the **target platform itself** — PyInstaller cannot cross-compile, so `struct_topology.exe` for Windows cannot be produced on Linux. `build-cli.mjs` provides a `--target <win|linux|mac>` guard and exits with an error immediately when the target platform does not match the host platform, preventing installers that are missing the CLI binary.

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
