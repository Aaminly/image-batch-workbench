# 抠图保留文字与文字分层验收

用户批准原图/结果切换下、抠图按钮上的两项主从复选框及三态，并于2026-11-06确认将本地现有改动检查后提交到main。本次没有新增热更新或公开发布渠道。

## 当前证据
- `work/text-cutout/python-final.log`：33项 Python 通过（文字蒙版、边缘去底色、局部覆盖主体拒绝、框外装饰拒绝、参数和旧接口、草稿保存）。
- `work/text-cutout/js-final.log`：59项相关 Node 检查通过；含来源、关联层、每尺寸几何、锁定、同步、替换/清理、历史、状态。不是全仓通过声明。
- `work/text-cutout/browser.json`：Chrome 实际 plain/keep/split HTTP200；三态依赖、独立移动、原图隐藏、撤销重做、保存刷新、重复抠图、失败原子性、PNG/ZIP、1512×982桌面/1280×620短窗口/390×844窄屏。重抠及错误的补充UI检查复用实际返回素材。
- `work/text-cutout/browser-split-final.json`：最终算法和带2px透明边距的split，再次通过上述关联链路；无页面脚本异常。只重跑受影响split，其余模式复用前轮。
- `work/text-cutout/render.log`：真实 Canvas 对照合成/分层，在crop=false/true × feather=0/.2下，最大RGBA字节差0/0/1/1，均值≤0.000525；紧裁点击范围、原图隐藏与可见文字层点击顺序通过。
- `work/text-cutout/decoration-actual.json`：实际 Vision 原干净中英文样图接受；添加OCR框外绿色装饰点后整次明确422，不带入文字层。
- `work/text-cutout/runtime.json`：本机8765已按原0.0.0.0和192.168.1.3局域网白名单重启，模型就绪，当前后端模式校验生效。
- `work/text-cutout/runtime-split.json`：更新后的真实8765服务分层请求200，1100×720输入处理16.8秒，主体及紧裁文字尺寸正确、裁切边距透明。无草稿变更。
- `git diff --check` 通过。UI机械检查仅命中已有隐藏空缩略图和既有紧凑字号层级，未改动无关设计。

## 基线与边界
- 扩展到几何回归时有1项旧失败：`sync preserves each target own nonuniform scale and west/north opposite anchors`。在独立临时目录的HEAD源码上复现同一失败，见`work/text-cutout/geometry-baseline.log`，本次未修改该缩放算法。
- 文字定位使用macOS系统Vision及本机swiftc，无新增Python依赖，无云端上传。非macOS或缺少命令行工具时仅文字模式明确503，普通抠图仍可用。
- 可靠提取依赖文字周围平稳底色；复杂底纹、过小字、分层文字覆盖人物等明确失败且不改项目。OCR漏字、框内与笔画相似的装饰无法保证自动排除，复杂海报需目检。不重排字体或补画遮挡人物像素。
- 未做真机移动端或全仓测试，不涉及远端发布。

Astra初评、独立技术复核、代码复核和修复后样图质量验收均已完成；最终浏览器、运行时及提交前边界修复已由Astra补核通过。

## main 提交前边界修复与验证
- 草稿关联图片扫描遇到非字典元素时返回400，保留已有revision；回归先复现AttributeError，再修复通过。
- 分层响应按主体PNG与文字PNG分别执行32 MiB限制；JSON响应允许两份base64及必要元数据。真实Chrome用24 MiB有效PNG验证总JSON超过32 MiB仍可保存，单张32 MiB+1则保留项目不变。
- plain/keep移除提交前重复解码；split保留图像与几何尺寸交叉校验。
- `work/text-cutout/push-js.log`：本轮49项相关Node检查通过；`push-python.log`：21项相关Python检查通过。不是全仓通过声明。
- `response-browser-green.log`：响应边界Chrome检查通过；`push-render.log`：本轮Canvas像素与点击顺序回归。
- 复用已有三态真实模型、Vision、运行时与桌面/窄屏证据：本轮未改动分割、文字提取、Swift识别或渲染算法，新增边界另有回归。上述旧几何基线失败保持记录。
