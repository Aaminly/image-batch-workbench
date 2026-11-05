# Third-party notices / 第三方说明

The project's own code and documentation are offered under the [MIT License](LICENSE). This does not relicense third-party software, model weights, or externally sourced images.

本项目自身代码和文档采用 MIT；第三方软件、模型权重及外部图片仍适用各自的许可与使用条件。

## Software and model sources

| Component | Use and upstream license information |
| --- | --- |
| [rembg](https://github.com/danielgatis/rembg) | Background-removal integration. Upstream source uses [MIT](https://github.com/danielgatis/rembg/blob/main/LICENSE.txt). |
| [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) | Segmentation model architecture. Upstream source uses [MIT](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE). Model weights and their distribution terms should be checked separately at their download source. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | CPU inference; [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE). |
| [FastAPI](https://github.com/fastapi/fastapi) | Local API service; [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE). |
| [Pillow](https://github.com/python-pillow/Pillow) | Image processing; [MIT-CMU](https://github.com/python-pillow/Pillow/blob/main/LICENSE). |
| [pngquant](https://pngquant.org/) | Separately installed command-line compressor invoked as a subprocess. Available under GPL or a commercial license, as explained by its upstream project. It is not MIT-licensed by this repository. |
| [zip.js](https://github.com/gildas-lormeau/zip.js) | Browser-local ZIP creation; [BSD-3-Clause](https://github.com/gildas-lormeau/zip.js/blob/master/LICENSE). Pages includes its self-hosted ESM bundle and license in `vendor/zip.js` and `vendor/zip.LICENSE`. |
| [Playwright](https://github.com/microsoft/playwright) | Browser testing; [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE). |

The source repository does not bundle dependency packages, model weights, browser binaries, or the pngquant executable. The deployed Pages artifact includes the pinned zip.js browser bundle with its license; it does not load this library from a CDN. `setup.sh` installs pinned Python dependencies and asks rembg to download `birefnet-general`; the upstream download implementation for the pinned rembg version is the source of the weights. Version references are in `requirements.txt` and `package-lock.json`.

上表为主要组件说明，不是完整的传递依赖清单或法律审计。若分发带依赖、模型或二进制的安装包，应根据实际捆绑版本检查并保留相应许可和声明；单独安装或子进程调用不应被解释为对所有分发方式的合规保证。

## Included images

- `tests/fixtures/astronaut.png`: photograph of NASA astronaut Eileen Collins, obtained through `skimage.data.astronaut`. The [scikit-image source documentation](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut) identifies its NASA origin and public-domain status. Used for segmentation tests; no NASA endorsement is implied. This image is not relicensed as original project artwork.
- `tests/fixtures/layout.png`: synthetic geometric test artwork created for this project.
- `docs/assets/workspace.png`: screenshot of the running application using synthetic geometric demo artwork, captured in an isolated instance; it does not contain user project assets.
- `web/assets/workbench-logo.png` and the favicon resources: generated with an AI image tool for this project and refined to the selected design. This provenance statement is not an exclusive-rights or trademark-clearance guarantee.

See also [test fixture notes](tests/fixtures/README.md).
