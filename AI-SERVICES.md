# 音乐云服务配置

首页已接入 AudD 原曲识别，以及 ElevenLabs Music 完整人声歌曲生成。服务密钥只在后端使用。访客也可在服务弹窗填写自己的密钥，仅当前窗口有效，关闭即清除。

网站统一账号需要在 Sites 的生产环境变量中安全设置：

- `AUDD_API_TOKEN`：AudD token。
- `ELEVENLABS_API_KEY`：有 Music API 权限和额度的 ElevenLabs key。
- `SUNNY_AI_RECOGNITIONS_PER_DAY`：统一账号每天最多识曲请求数。默认 0，即关闭共享服务。
- `SUNNY_AI_MUSIC_MINUTES_PER_DAY`：统一账号每天最多提交的歌曲分钟数。默认 0，即关闭共享服务。
- `ELEVENLABS_MUSIC_MODEL`：可选，默认 `music_v2_5`。

设置后需要重新部署当前版本。公开网页可匿名访问。只有服务 key、额度和 D1 都可用时才显示网站服务已连接。配额按 UTC 日期重置；请求提交后占用额度，服务报错也不会退回，避免未知计费情况下反复调用。配额计数与去重记录放在 D1，不保存访客密钥、录音、歌词或成品。服务供应商会按其政策处理请求内容。

MiniMax 模式适用于已经有音乐 API 权限的旧付费账号。2026-08-20 起官方不再向新用户开放付费音乐 API。可设置 `MINIMAX_API_KEY`、`MINIMAX_REGION=cn`、`MINIMAX_MUSIC_MODEL=music-3.0`。该模式必须填写歌词，成品时长由服务决定，不保证选定分钟数。

前端不重试生成请求。关闭窗口或停止等待会中断连接，但供应商可能已开始处理并计费。遇到中断请先检查供应商后台，再重新提交。

构建：`npm run build`。从 `source/` 重建 `public/index.html`，再将网页、媒体和 `worker/music-api.mjs` 打包至 `dist/server/index.js`。图片和音频字节嵌入 Worker。D1 表由 `drizzle/0000_ai_quota.sql` 创建。MiniMax 共享服务按每次请求 6 分钟预留额度，适用于时长由服务决定的模式；ElevenLabs 按选择的分钟数预留。

接口文档：
- https://docs.audd.io/
- https://elevenlabs.io/docs/api-reference/music/create-composition-plan
- https://elevenlabs.io/docs/api-reference/music/compose
- https://platform.minimax.io/docs/api-reference/music-generation
