# xiaoliang.tech

肖的个人主页：作品、书房和做法。纯静态单页，没有构建步骤，没有框架。

- `index.html`：全部样式和脚本都在这一个文件里
- `img/`：作品截图，来自各项目仓库的 README

## 页面里有什么

- 首屏的作品星图用 Canvas 画，每个节点是一个真实项目；右侧终端演示通过 MCP 向站点提问，问到哪类项目，星图里对应节点就亮起来
- StylePolish 卡片是可以直接打字的润色演示
- 作品列表悬停时，截图跟随鼠标出现
- 书房的目录取自 [知识书房](https://plan.xiaoliang.tech/reader/)
- 支持 `prefers-reduced-motion`，手机单栏

## 本地预览

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 许可

代码 MIT。截图版权归各项目所有。
