# 静态部署

PosterWall 不需要上传接口或服务器存储。用户的图片与项目留在浏览器，图片导出和 JSON 下载均在本机进行。

## 构建

```bash
npm ci
npm run check
npm test
npm run build
```

发布 `dist/`。构建包含网页、`src/` 和应用图标 `public/icon.svg`，示例封面由程序生成。普通静态托管即可运行；ES Modules 需要通过 HTTP(S) 提供。

## 已有网站的 /posterwall/ 子路径

例如把 `dist/` 内容复制到服务器 `/www/wwwroot/posterwall/`，在已有 Nginx HTTPS 站点中增加以下 location，保留博客原有配置：

```nginx
location = /posterwall {
    return 301 /posterwall/;
}
location ^~ /posterwall/ {
    alias /www/wwwroot/posterwall/;
    index index.html;
    add_header X-Content-Type-Options nosniff;
    add_header Cache-Control "no-cache";
}
```

确认站点加载了 Nginx 的标准 `mime.types`，`.js` 应以 JavaScript MIME 类型响应。`^~` 让此子目录优先于博客其它静态资源正则规则。`alias` 目录末尾的 `/` 必须保留。不要把源仓库目录作为此 alias。先 `nginx -t` 再按现有运维流程重载。

访问 `https://你的域名/posterwall/`，测试导入图片、PNG 下载、刷新恢复草稿，以及 `src/app.js`、`src/demo.js` 正常响应。HTML、脚本和样式不做长期缓存，避免不同版本混用。

## 独立域名 / 子域名

让静态站点根目录指向构建后 `dist/` 的内容即可。例如 `https://posterwall.example.com/`。建议 HTTPS；图片处理不依赖外部网络服务。

## GitHub Pages（可选，手动启动）

仓库包含只支持 `workflow_dispatch` 的 `.github/workflows/pages.yml`。上传代码不会自动发布。

1. 在仓库 Settings → Pages → Build and deployment 选择 GitHub Actions。
2. 在 Actions 中选择 Deploy PosterWall → Run workflow。
3. 工作流运行校验、测试和构建，上传 `dist/`，最后发布 Pages。

更换域名 / 路径不需要修改前端 base URL，资源地址全部相对入口页面。部署之前先取得站点所有者授权。

## 本地验证子路径

```bash
npm run build
node scripts/serve.mjs --dist
```

访问 <http://127.0.0.1:4180/posterwall/>。本地服务只用于预览，监听 `127.0.0.1`，无需将它暴露到公网。清理本机浏览器数据不会影响服务器，也无法从服务器恢复本机草稿。
