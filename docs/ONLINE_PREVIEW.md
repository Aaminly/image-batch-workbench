# 免费在线预览可行性 / Free online preview feasibility

评估日期 / Assessed: 2026-11-05。本文是方案评估，在线预览尚未实现或部署。平台规则和额度可能变化。

## 结论

建议采用 **GitHub Pages 上的独立静态交互预览模式**。托管可使用免费额度，但需要适配真实存储和导出边界，不能直接把当前 `web/` 上传后视为完整在线版。

本地完整版继续保留抠图、压缩、ZIP 和批次自动保存。预览模式的能力差异应在实施前明确选定，不以假 API、模拟成功或静默回退代替真实功能。

## 托管选项

| 选项 | 当前官方条件 | 对本项目的判断 |
| --- | --- | --- |
| GitHub Pages | GitHub Free 的公开仓库可托管 HTML/CSS/JS 静态站点。 | 首选交互预览；不能运行当前 Python 后端。 |
| Cloudflare Pages | Free 计划每月 500 次构建、单文件最多 25 MiB。 | 可作静态预览替代；无法把约 1 GB 模型作为普通静态单文件直接上传。 |
| Render Free Web Service | 0.1 CPU / 512 MB；15 分钟闲置休眠，重启或休眠会丢失本地文件。 | 不建议用于当前完整后端和本地大模型，也不能沿用草稿持久保存承诺。 |
| Hugging Face Spaces | Static Spaces 免费；目前新建普通 Gradio / Docker compute Space 需要付费计划，部分 ZeroGPU Gradio 有另行资格规则。 | CPU Basic 无小时费不等于普通新账号可免费新建当前 FastAPI Docker 服务。 |

来源：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)、[Render compute](https://render.com/docs/compute-plans)、[Render free limits](https://render.com/docs/free)、[Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-overview)。上述判断没有使用付费试用金来承诺长期免费。

## 为什么现有代码不能直接静态部署

- `web/app.js` 的启动流程依赖草稿恢复；API 不可用时会锁定编辑区域。
- `web/drafts.js` 的批次与素材主存储在后端。`web/recovery.js` 的 IndexedDB 仅是未提交编辑检查点，不能当作现成的浏览器批次数据库。
- 撤销 / 重做会调用草稿保存流程，静态版需要接通真实会话历史。
- 单张 PNG 依赖 `/api/compress-png`；ZIP 依赖 `/api/archives`。
- 根路径静态资源与 API 路径需要适配 Pages 的仓库子路径。

## 建议的预览范围（待实施）

保留真实的图片导入、预设及自定义尺寸、画布浏览、图层编辑、同组同步与锁定、版面检查、内存会话中的撤销 / 重做、JSON 项目导入 / 导出。

明确停用本地模型抠图、服务器批次自动保存、pngquant 压缩与 ZIP。提示“刷新会重置，请下载项目 JSON 备份”，并提供本地完整版安装入口。浏览器原始 PNG 下载可作为另行选定的能力，但必须注明未经 pngquant 压缩，不能在压缩失败后自动冒充成功。

该方案复用现有渲染与编辑逻辑，不将用户图片发送到处理服务器。若需要跨刷新自动保存，应另行实现正式 IndexedDB 存储及容量失败处理，不把内存会话描述为持久保存。

## 完整后端公开部署前的必要工作

当前服务面向单机使用，草稿列表与素材没有访客身份隔离。同源校验不能隔离同一网站的不同访客。直接公开会带来跨访客访问和资源滥用风险。

完整云端版需要会话 / 租户隔离、草稿与导出的归属校验、容量与并发限制、临时文件清理、实际域名及代理配置，并更新“图片不上传”的本机隐私文案。还需在目标 Linux 环境验证依赖安装、模型加载、冷启动和推理峰值。本轮没有测量云端推理性能。

## 预览验收标准

1. 在真实仓库子路径启动，网络记录中没有业务 `/api/` 请求或用户图片外发。
2. 图片导入、尺寸、同步隔离、编辑、撤销以及 JSON 往返真实可用。
3. 明确展示刷新语义与不可用功能，不出现虚假的自动保存成功状态。
4. 若包含原始 PNG，验证目标像素、裁切范围与透明度，并标明压缩差异。
5. 本地完整版保存、抠图及导出行为保持；运行受影响的回归。

## English summary

A free static interactive preview is feasible, with **GitHub Pages** as the preferred host and Cloudflare Pages as an alternative. The current application is not directly static-hostable: startup, drafts, history transitions, PNG compression, and ZIP export depend on backend APIs, and root-relative assets need project-subpath support.

The proposed preview would retain real canvas editing, local imports, sizes, synchronization, in-memory undo/redo, and JSON import/export. It would explicitly disable model-based cutouts, server autosave, pngquant, and ZIP, with a clear reset-on-refresh message. Raw browser PNG export is an optional scope decision and must not be presented as compressed output. None of this preview mode has been implemented or deployed.

Render's free 512 MB / 0.1 CPU instance is not recommended for the current model-backed service; idle restarts also discard local files. New ordinary Docker/Gradio compute Spaces on Hugging Face currently require a paid plan despite zero hourly pricing for CPU Basic. Full public hosting additionally requires visitor isolation, ownership checks, quotas, cloud privacy disclosures, and measured runtime validation. See the official sources above; future free-tier availability is not guaranteed.
