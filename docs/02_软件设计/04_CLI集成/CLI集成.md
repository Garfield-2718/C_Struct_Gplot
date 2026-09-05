# 将 C_Struct_Gplot_CLI 二进制集成进 Electron 应用

## 目标与约束
- 范围：把 CLI 的 PyInstaller 二进制放入 Electron 项目、随 `electron-builder` 打包；Electron 与 CLI 的**交互接口先打桩**，实际调用与数据解析后续开发。
- 平台：Windows 11 x64 + Linux/WSL x64。PyInstaller 不能交叉编译，**每个平台的二进制必须在对应平台上构建**。
- CLI 源码不搬入 Electron 仓库，Electron 仓库只存二进制产物。构建时 CLI 源码的获取方式有两种：
  - 默认（发布/CI）：从 GitHub 仓库 `https://github.com/Garfield-2718/C_Struct_Gplot_CLI.git` 通过 `git clone` 获取。
  - 开发调试：从本地指定路径获取（**仅用于开发调试**）。
- 可执行文件不能进 asar（无法从 asar 内运行），统一用 `extraResources` 分发到 `process.resourcesPath`。

## 1. 目录布局：新增平台化 sidecar 目录
在 Electron 项目根新增（与现有 `resources/` 分开，避免被 `asarUnpack: resources/**` 拉进 asar）：
```
binaries/
  windows-x64/struct_topology.exe
  linux-x64/struct_topology
  .gitkeep
```
- 目录名沿用 CLI `detect_platform()` 的产物命名（`windows-x64` / `linux-x64`），保持一致。
- 二进制体积大：在 `.gitignore` 增加 `binaries/*/struct_topology*`（保留 `.gitkeep`），由构建脚本生成，不入库（如需自包含仓库可改为提交二进制，见 Assumptions）。

## 2. 构建并放置二进制的脚本
新增 `scripts/build-cli.mjs`（Node，跨平台），职责：
1. 获取/定位 CLI 工程源码（下述 `<cli>` 即解析出的源码根目录）：
   - 开发调试（硬编码，不读环境变量）：在脚本顶部写死开关与本地路径常量，例如 `const USE_LOCAL_CLI = false` 与 `const LOCAL_CLI_DIR = '/home/wsl/code/C_Struct_Gplot_CLI'`；当 `USE_LOCAL_CLI` 为 `true` 时直接使用该硬编码路径，跳过 clone。
   - 默认（GitHub）：使用本地缓存目录（如项目根 `.cli-src/`，需加入 `.gitignore`）。
     - 若不存在：`git clone https://github.com/Garfield-2718/C_Struct_Gplot_CLI.git .cli-src`。
     - 若已存在：先校验是否为最新代码——`git fetch origin` 后比较本地 `HEAD` 与 `origin/HEAD`（默认分支，`git rev-parse HEAD` vs `git rev-parse origin/HEAD`）；落后则 `git pull --ff-only` 更新到最新，一致则直接复用。
2. 调用其现有打包脚本：`python3 <cli>/build_package/build_package.py --onefile`（Windows 用 `python`），产物落在 `<cli>/build_package/dist/<platform>/`。
3. 依据 `process.platform`/`process.arch` 映射出 `<platform>` 目录名与 exe 名（win32->windows-x64 + `struct_topology.exe`；linux->linux-x64 + `struct_topology`）。
4. 复制到 Electron 项目 `binaries/<platform>/`；Linux 下 `fs.chmodSync(dst, 0o755)` 保留可执行位。

在 `package.json` scripts 增加：
```jsonc
"build:cli": "node scripts/build-cli.mjs",
"dist:win":  "npm run build:cli && npm run build && electron-builder --win",
"dist:linux":"npm run build:cli && npm run build && electron-builder --linux"
```
（`dist:*` 需在对应平台上执行；保留原有 `build:*` 不变。）

## 3. electron-builder 打包配置
编辑 `electron-builder.yml`：
- `files` 增加排除，防止二进制/脚本被打进 asar（与 `extraResources` 重复）：
```yaml
files:
  - '!binaries/**'
  - '!scripts/**'
  # ...保留现有其它排除项
```
- 按平台增加 `extraResources`（`from` 相对项目根，`to` 相对 `process.resourcesPath`）：
```yaml
win:
  executableName: .
  extraResources:
    - from: binaries/windows-x64
      to: cli
linux:
  extraResources:
    - from: binaries/linux-x64
      to: cli
  # 保留现有 target/maintainer/category 等
```
打包后二进制位于 `<安装目录>/resources/cli/struct_topology[.exe]`。

## 4. 主进程调用脚手架（打桩）
新增 `src/main/cli-service.ts`：
- `resolveCliBinary(): string`（**真实实现**，可立即验证打包是否成功）：
  - `app.isPackaged` -> `path.join(process.resourcesPath, 'cli', exeName)`
  - 开发态 -> `path.join(app.getAppPath(), 'binaries', platformDir, exeName)`
  - exeName/platformDir 由 `process.platform`、`process.arch` 映射（与脚本第 3 步同一套映射）。
- `spawnCli(args: string[]): Promise<{code,stdout,stderr}>`（**通用助手，真实实现**）：用 `child_process.execFile` 封装；`cwd` 设为 `app.getPath('userData')`（CLI 的 `output/`、`.temp_file` 依赖 `os.getcwd()`，需指向可写目录）。
- 业务级函数 `runInit(...)` / `runSvg(...)`：**打桩**，仅 `console.log` 解析到的路径与预期参数并返回占位结果，内部标注 `// TODO: 调用 spawnCli 并解析 SVG/DB 输出，后续实现`。

编辑 `src/main/index.ts`：
- 顶部 `import { registerCliIpc } from './cli-service'`（或直接在文件内注册）。
- 在 `app.whenReady()` 内注册打桩 IPC：
  - `ipcMain.handle('cli:locate', () => resolveCliBinary())`（返回解析路径，便于冒烟验证）
  - `ipcMain.handle('cli:init', () => runInitStub())`、`ipcMain.handle('cli:svg', () => runSvgStub())`（打桩）

## 5. preload / renderer 打桩接口（最小）
- `src/preload/index.ts`：在 `api` 中增加 `cli: { locate: () => ipcRenderer.invoke('cli:locate') }`（init/svg 可先不加，保持最小）。
- 渲染层暂不接入；`canvas_view` 继续使用现有 mock 数据，符合"交互后续开发"的约定。

## 6. 验证
1. Linux/WSL：`npm run build:cli` -> 确认 `binaries/linux-x64/struct_topology` 生成且可执行。
2. `npm run build:unpack`（electron-builder --dir）-> 检查 `out/.../resources/cli/struct_topology` 存在且带 +x。
3. 运行应用，主进程/渲染层调用 `cli:locate` 打印路径，确认 `app.isPackaged` 与开发态两条路径都解析正确。
4. Windows 11：在 Windows 上重复 1-3（PyInstaller 需在 Windows 本机跑）。

## Assumptions
- CLI 源码不搬入 Electron 仓库；构建脚本默认从 GitHub 仓库 `Garfield-2718/C_Struct_Gplot_CLI` `git clone` 到本地缓存目录（如 `.cli-src/`，需 gitignore），并在每次构建前 `git fetch` 校验/更新到最新代码；开发调试时通过脚本内**硬编码**的开关与路径常量切换到本地源码目录（不使用环境变量）。
- 默认二进制不入库（`.gitignore` 排除），由 `build:cli` 在打包前生成；若希望仓库自包含，可改为提交 `binaries/*` 并去掉该 gitignore（此时注意保留 Linux 可执行位）。
- 本机开发环境已具备 `python3` 与 PyInstaller（缺失时可用 CLI 脚本的 `--auto-install`）。
- macOS 暂不在本次范围；如需支持，按同一模式追加 `mac.extraResources` 与 `macos-<arch>` 目录即可。
