# 六色人像本地验证工作台 v0.1

公开静态版地址：**https://arsenaltj.github.io/portrait-validation-web/**。本地版仍可在 Chrome / Edge 打开 **http://127.0.0.1:18873**。需要 WebGL，不能用 file:// 直接打开。

网页与非人像合成演示公开。使用者选择的照片、GLB 不会上传到 GitHub 或任何生成服务，文件仅在当前浏览器解析。访问网页会从 GitHub Pages 下载静态资源；没有自建遥测、远程图片处理或生成 API。手机可访问公开网页，本地 127.0.0.1 地址仍仅限当前电脑。

## 静态构建与部署

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run preview:static
```

本地静态子路径预览为 `http://127.0.0.1:18874/portrait-validation-web/`，按 Ctrl+C 停止预览进程。构建仅复制明确允许的前端文件、合成 demo 和必要 Three.js 模块到 `dist/`；不复制服务端、测试输出、原图、私有 GLB、认证或日志。Three.js MIT 许可随静态产物保留。

`.github/workflows/pages.yml` 使用官方 GitHub Pages artifact/deploy 工作流，Actions 从 `main` 构建并部署。本地运行目录不进 Git，也不进 Pages。静态版没有 Tripo 服务接口，按钮固定禁用；不会启动任何后端或读取认证。

## 启动和停止

在本目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop.ps1
```

端口被占用时不会停止已有服务，可用 `start.ps1 -Port 18874` 选择其他端口。脚本只管理本项目 Node 服务；启动前/停止前核对记录中的 PID、项目路径、进程名称和完整服务脚本路径。服务只监听 127.0.0.1，没有自启任务、局域网开放、防火墙修改或隧道。

也可用 `node server.mjs` 前台启动，在原终端按 Ctrl+C 停止。运行日志及服务记录位于 `runtime/`。Three.js 依赖已安装并锁定；重新安装可执行 `npm.cmd ci --ignore-scripts --no-audit --no-fund --cache .cache/npm --registry=https://registry.npmjs.org`。

## 使用

1. 选择本地原图和 GLB，或载入非人像合成演示模型。
2. 拖动任一模型旋转，滚轮/双指缩放；三栏同步视角。原纹理与限色采用无光照基色，灰模采用统一灰材质和几何光照。
3. 编辑六个基材 RGB 并应用色板。映射采用 sRGB → CIELAB D65 → 最近 ΔE76；距离相同选先出现的色，无抖动。纹理长边最多 1024 像素，限色纹理使用最近邻采样。
4. 默认喷嘴 0.4 mm、目标高度 200 mm，全身/头部待确认。这些是记录参数，不会缩放源文件或触发切片。
5. 保存到当前浏览器，或导出 JSON 和三栏 PNG。保存参数、视角、统计、文件 SHA-256 与人工记录；照片和 GLB 不写入浏览器存储。恢复时需重新选择相同文件，统计从当前模型重新计算。PNG 不包含原图像素，完整记录在 JSON。

## 格式及验证限制

- 原图：PNG/JPEG/WebP，最多 20 MB / 4000 万像素。
- 模型：内嵌资源 GLB 2.0、三角面，最多 64 MB / 50 万面。外部资源 URL 被阻止。Draco、Meshopt、KTX2/Basis 和骨骼网格不支持，请导出静态未压缩 GLB。
- 不播放动画；基色对照不包括金属度、粗糙度、法线贴图、发光和材质扩展的效果。透明合成色可能超出色板值。
- 纹理与顶点色同时存在时，限色只处理纹理并关闭顶点色；多材质顶点色采用首个材质基色，界面会提醒。顶点插值可能形成中间色。首版不输出新的 GLB 或可切片颜色分区。
- 色占比是像素/顶点/材质采样计数，不是表面积或用料。ΔE76 是数字色差，不是打印实测色差。色板未标定，没有 CMYK 叠色或 24 色实物准确性结论。
- 没有身份相似性、语义 AI、真实切片或实物打印验收。安卓仅做无头响应式和触摸模拟，未做实机验收。用户的失败案例及原图/清理图/轻增强图生成对照尚未执行。

## 本地与 Tripo 边界

文件在浏览器本地解析，服务器不接收上传。Tripo 适配器固定禁用，生成/上传路由返回拒绝，不读取或存储 API 密钥，不发送供应商请求。本轮没有设置持久认证。未来启用需先确认图片上传范围及总费用上限，认证仅留在服务端，不传浏览器。

工程、缓存和输出均在此独立目录，未修改或编译现有 OrcaSlicer 项目。

## 测试证据

`npm.cmd test` 运行核心及静态边界测试；`node tests/browser.mjs` 使用 Playwright 和独立无头 Chrome，只使用合成图片和 GLB。可通过 `PLAYWRIGHT_MODULE_PATH` 指定既有 Playwright 安装位置，通过 `BROWSER_EXECUTABLE_PATH` 指定无头浏览器。浏览器配置在 `.cache/`，证据在 `outputs/qa/`：`browser-results.json`、`desktop.png`、`mobile.png`、实际导出的 `comparison.png` 和 `experiment.json`。测试输出不提交到公开仓库。

验证静态本地或已部署网页：设置 `WORKBENCH_TEST_MODE=static`，将 `WORKBENCH_TEST_URL` 设为完整项目 URL（包含子路径），并用 `WORKBENCH_QA_LABEL` 选择独立输出目录。使用合成参考图前可运行 `node generate-demo.mjs`。这些环境参数不含凭据。
