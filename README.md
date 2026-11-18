# 夏日音乐 · 完整源码（线上第 9 版）

这是当前网页的完整 HTML、CSS、JavaScript、媒体素材和音乐服务后端代码，包含首页、热门音乐、我的音乐、歌单、搜索、播放器与歌词六个页面。

对应版本见 `VERSION.json`。为方便在自己的电脑上运行，源码包额外提供了 Node.js 本地服务器和单文件 HTML 导出脚本。项目没有第三方 npm 依赖。

## 本地运行

需要 Node.js 24 或更高版本。在解压后的项目目录中运行：

```sh
node scripts/dev-server.mjs
```

然后打开：

```text
http://127.0.0.1:5173/
```

Windows 也可以双击 `start-windows.cmd`。启动时会自动合并前端源文件并读取可选的 `.env`。按终端中的 `Ctrl+C` 停止服务器。如已安装 npm，也可以使用 `npm start`。

如果端口被占用，可把 `.env.example` 复制为 `.env`，修改其中的 `PORT` 后重新启动。

## 主要代码在哪里

| 内容 | 文件 |
| --- | --- |
| 六个页面的 HTML 结构 | `source/index.template.html` |
| 页面路由、播放、歌词、收藏、队列与搜索 | `source/site.js` |
| 基础布局和控件 | `source/site.css` |
| 当前浅色主题与侧栏图标 | `source/bright.css` |
| 歌手主图与图片布局 | `source/stage.css` |
| 鼠标拖动、手机滑动、触控板横滑 | `source/swipe.js`、`source/swipe.css` |
| 实时日期与时间 | `source/live-date.js` |
| 弹跳入场、点击反馈等动效 | `source/motion.js`、`source/motion.css` |
| 首页新增模块 | `source/home-modules.js`、`source/home-modules.css` |
| 热门音乐新增模块 | `source/hot-modules.js`、`source/hot-modules.css` |
| AI 识曲与人声写歌界面 | `source/cloud-music.js`、`source/cloud-music.css` |
| 云端识曲、写歌与配额接口 | `worker/music-api.mjs` |
| 本地离线试听指纹匹配 | `source/audio-match.js` |
| 歌曲、歌词、歌手和素材数据 | `source/media-catalog.json` |
| 图片、试听录音和听书音频 | `public/media/` |
| 合并后的完整网页代码 | `public/index.html` |
| 本地服务器与 SQLite 配额适配 | `scripts/dev-server.mjs` |

`source/index.template.html` 中的 `{{CSS}}`、`{{JS}}`、`{{MEDIA}}` 由构建脚本自动替换。

修改源文件后运行下面的命令，再刷新浏览器：

```sh
node scripts/build-frontend.mjs
```

## 单文件 HTML

如果只想直接打开一个网页文件，运行：

```sh
node scripts/export-standalone.mjs
```

生成的 `standalone.html` 已内嵌图片、图标字体、试听音乐和听书音频。可以双击打开，使用页面浏览、左右滑动、试听和同步歌词等本地功能。

云端 AI 需要通过本地或线上服务器运行；MV 和外部榜单需要网络。完整的服务运行方式仍是上面的本地服务器命令。

## AI 服务配置

代码已经包含 AudD 识曲，以及 ElevenLabs / MiniMax 人声歌曲生成接口。源码包不附带账号密钥和服务额度；真实云端结果需要可用账号。

本地使用有两种方式：

1. 启动网页后，在识曲或写歌弹窗中填自己的服务密钥，密钥只用于当前窗口。
2. 将 `.env.example` 复制为 `.env`，填写服务密钥并自行设置每日额度，再重启服务器。每日额度默认为 `0`，表示关闭共享服务。

本地服务器会在 `data/local.sqlite` 保存配额和请求去重记录。`.env` 和 `data/` 已列入 `.gitignore`。

更多服务说明见 `AI-SERVICES.md`。网页右下角的 © 入口保留了图片与音乐的来源、署名和授权信息。

## 构建部署版

```sh
node scripts/build.mjs
```

此命令会从 `source/` 重建网页，再生成 `dist/server/index.js`，用于 Cloudflare Worker / 当前 Sites 托管流程。原站点的配置保存在 `.openai/hosting.json`；另建站点时需使用目标站点自己的配置和数据库绑定。

Node.js 本地服务器与 Worker 使用同一份 `worker/music-api.mjs` 后端逻辑。

## 验证接口逻辑

```sh
node --test tests/music-api.test.mjs
```

这些测试使用本地模拟服务响应，验证识曲、歌曲传输、错误提示、每日额度和重复请求处理。

## Render 部署

仓库根目录的 `render.yaml` 已配置完整 Node.js Web Service。也可以在 Render 手动创建 Web Service：

- Repository: `https://github.com/shark080304/yinyue`
- Branch: `main`
- Runtime: Node
- Build Command: `node scripts/build-frontend.mjs`
- Start Command: `node scripts/dev-server.mjs`
- Instance Type: Free
- Environment: `HOST=0.0.0.0`, `NODE_VERSION=24.22.1`, `NODE_ENV=production`
- Health Check Path: `/api/ai/status`

无需安装 npm 依赖。Render 提供 `PORT`，服务会自动读取。免费实例闲置后会休眠，下一次打开时可能需要等待启动；SQLite 配额记录会在重启或重新部署后重置。收藏、歌单等前端个人数据继续存储在访问者浏览器中。

源码不包含第三方 AI 服务密钥。识曲和歌曲生成功能可在网页“服务设置”中使用自己的 API 密钥；如需开通全站共享服务，请在 Render 配置相应密钥和额度，并使用可持久化的数据存储。
