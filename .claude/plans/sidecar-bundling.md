# 计划:把 Node 后端打包成 Tauri 内置服务(sidecar),浏览器用系统 Chrome

## 目标
`npm run tauri build` 出来的 app 双击即可运行,不再需要手动起后端。浏览器自动化(agent/生成/录制/运行)改用系统已安装的 Chrome,不打包 Chromium。

## 背景(已确认)
- 前端 `import.meta.env.DEV ? '' : 'http://127.0.0.1:4123'`,生产直连后端。
- 后端 [server/src/config.ts](server/src/config.ts) 已预留 `CONFIG_PATH`(Tauri 注入 app_data_dir);[server/prisma.config.ts](server/prisma.config.ts) 预留 `DATABASE_URL` 注入;AI key 由「设置」页写入,无需打包密钥。
- Prisma 7 + `@prisma/adapter-better-sqlite3`(无独立 Rust engine)。better-sqlite3 是原生 `.node`(arm64)。
- 三处浏览器启动点:[stagehandManager.ts:34](server/src/services/stagehandManager.ts#L34)、[runnerService.ts:37,43](server/src/services/runnerService.ts#L37)、[recorderService.ts](server/src/services/recorderService.ts)(codegen CLI)。
- 范围:**macOS arm64 only**(本机),x64/universal/Windows 与代码签名后续再做。

---

## A. 后端:打包成单文件 bundle
**问题**:`server/tsconfig.json` 是 `noEmit:true`,且源码用无扩展名 import(`'./routes/projects'`),Node ESM 运行时必须带扩展名 → 不能直接 `tsc` 产物跑。dev 用 `tsx` 实时解析,生产需要 bundle。

1. `server` 加 devDep `tsup`。新增 `server/tsup.config.ts`:
   - `entry: ['src/index.ts']`,`format: ['esm']`,`target: 'es2022'`(支持 top-level await),`platform: 'node'`,`outDir: 'dist'`,`clean: true`。
   - `external`:从 `package.json` 的 `dependencies`+`devDependencies` 取全部包名动态生成 → 所有 node_modules 外置(运行时从随包 node_modules 加载,保证 better-sqlite3 原生模块、playwright 等正常)。
   - 本地 `src/` 与 `generated/prisma` 被 inline 进单文件 → 产物 `server/dist/index.js`。
2. `server/package.json`:`"build": "tsup"`,`"typecheck": "tsc --noEmit"`(保留 `dev` 不变)。

## B. 浏览器:生产用系统 Chrome(开发不变)
3. 新增 [server/src/browser.ts](server/src/browser.ts):
   - `detectSystemChrome()`:macOS 候选 `Google Chrome` / `Chromium` / `Edge` / `Brave` 的 `.app/Contents/MacOS/...`,返回第一个存在的。
   - `browserLaunchOptions(extra)`:返回 playwright `launch` 选项对象。
     - `browserPath` 已配置 → `{ executablePath: browserPath, ...extra }`
     - `BROWSER_MODE==='system'`(Tauri 注入)→ 检测到系统 Chrome 用 `executablePath`,否则 `{ channel: 'chrome', ...extra }`
     - dev(无 `BROWSER_MODE`)→ `{ executablePath: chromium.executablePath(), ...extra }`(保持现状)
4. [stagehandManager.ts](server/src/services/stagehandManager.ts) `createSession`:`localBrowserLaunchOptions` 改用 `browserLaunchOptions({ headless:false, cdpUrl? })`。
5. [runnerService.ts](server/src/services/runnerService.ts) 两处 `chromium.launch` 改用 `browserLaunchOptions({ args: [...] })`。
6. [recorderService.ts](server/src/services/recorderService.ts) codegen spawn:按同样规则追加 `--executable-path=<path>` 或 `--channel=chrome`(dev 不加)。
7. [config.ts](server/src/config.ts) `AppConfig` 加 `browserPath: string`(默认 `''`)。
8. [routes/settings.ts](server/src/routes/settings.ts):GET 增返 `browserPath` / `detectedBrowserPath`;POST 接收 `browserPath`。
9. [src/pages/Settings.tsx](src/pages/Settings.tsx):加可选「浏览器路径」字段,placeholder 显示检测到的路径,留空=自动用系统 Chrome。

## C. sidecar:node + 后端作为 Tauri resources,Rust 启动
10. 新增 `scripts/prepare-sidecar.mjs`(`tauri build` 前自动跑):
    - `cd server && npm run build` → `server/dist/index.js`。
    - 暂存并裁剪生产依赖:`cp -R server .staging/server` → `npm prune --production`(去掉 tsx/prisma-cli/typescript/@types),把 `node_modules` 拷到 `src-tauri/resources/server/node_modules`。
    - 拷 `server/dist/index.js` → `resources/server/index.js`;拷 `server/package.json`。
    - 生成空库模板:`DATABASE_URL=file:../src-tauri/resources/app.db.template npx prisma db push --skip-generate --accept-data-loss`(在 server/ 内),得到带表结构、无数据的 `resources/app.db.template`。
    - 拷 node 二进制:`cp -L $(which node) src-tauri/resources/node`,赋可执行权限(arm64,本机 node)。
11. [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json):
    - `beforeBuildCommand` → `"npm run build && node scripts/prepare-sidecar.mjs"`。
    - 新增 `bundle.resources`:`["resources/node","resources/server/**/*","resources/app.db.template"]`。
12. 重写 [src-tauri/src/lib.rs](src-tauri/src/lib.rs):
    - `setup()` 内:取 `resource_dir`、`app_data_dir`;建目录。
    - 首次运行:若 `app_data_dir/app.db` 不存在,拷 `resource_dir/app.db.template` → `app_data_dir/app.db`。
    - 打开 `app_data_dir/server.log` 作 stdout/stderr。
    - `std::process::Command::new(resource_dir/node).arg(index.js).current_dir(resources/server)`,注入 env:`NODE_ENV=production`、`BROWSER_MODE=system`、`PORT=4123`、`DATABASE_URL=file:<app.db>`、`CONFIG_PATH=<app_data_dir/config.json>`。
    - `app.manage(Mutex::new(child))` 存子进程。
    - 轮询 `TcpStream::connect("127.0.0.1:4123")` 直到通(超时 15s),失败写日志。
    - 运行循环 `RunEvent::Exit` 时 `child.kill()`。
    - 保留 `tauri-plugin-log`(debug)。
13. 无需新 Rust 依赖(用 `std::process` + `std::net`)。

## D. 前端防御(小)
14. [src/api/client.ts](src/api/client.ts):`api()` 对连接失败做 2 次重试(300ms 间隔),兜住 setup→webview 加载的时序边角。setup 本会阻塞到端口就绪,重试仅为保险。

## E. 验证
15. `npm run tauri build`,安装,确认:app 打开不再「Load failed」、项目列表正常;执行一次「录制」或「生成」,弹出系统 Chrome。
16. 产物:`src-tauri/target/release/bundle/`。

## 注意 / 取舍
- 体积:node(~90MB)+ server 生产 node_modules(~150MB,含 playwright 包但不含浏览器)≈ 250MB。可接受。
- 未签名/公证:首次需右键「打开」绕过 Gatekeeper;分发后再做签名。
- 系统未装 Chrome 时浏览器功能会报清晰错误;可在「设置」指定路径。
- better-sqlite3 / node 二进制按 arm64 编译,换架构需重建(后续)。
- dev 模式完全不变(仍 `npm run dev` 起 vite+tsx,bundled chromium)。
