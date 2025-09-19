# 交互式地图 (map)

此页面使用 Leaflet 和 OpenStreetMap 实现一个简单的交互式地图。主要功能：

- 在地图上搜索地点（使用 Nominatim），搜索结果会居中并添加标记。
- 选择 Emoji 作为标记符号（可扩展为自定义 SVG）。
- 在地图中心添加标记、删除标记、清除所有标记。
- 标记会保存在 `localStorage`（浏览器本地），并支持导出/导入 JSON 文件。

文件说明：

- `index.html`：地图页面。
- `js/map.js`：地图交互逻辑（初始化、搜索、标记、持久化）。
- `css/map.css`：样式。

本地测试：

1. 在项目根目录运行本地服务器（例如 `npx http-server` 或者 Hexo 本身的 `hexo server`）。
2. 在浏览器中打开 `http://localhost:PORT/map/`（取决于你本地服务器端口）。

部署到 GitHub Pages：

1. 确保 `map/` 文件夹已被包含到最终的 `public/` 或者 `source/` 中，或在 Hexo 发布时复制到 `public/map/`。
2. 推送到仓库，GitHub Pages 将提供 `https://<username>.github.io/map/` 访问。

注意事项：

- Nominatim 有使用限制，请避免频繁自动化请求。生产环境可以考虑使用付费的地理编码服务或缓存查询结果。
- localStorage 仅存储在浏览器中，清除浏览器缓存会丢失标记。可使用服务器端存储或 GitHub Gist 做持久化扩展。
