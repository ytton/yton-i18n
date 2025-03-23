# yton-i18n WebView UI

这是yton-i18n插件的WebView用户界面，使用Vue 3 + Tailwind CSS开发。

## 开发

### 安装依赖

```bash
cd src/webview-ui
pnpm install
```

### 开发模式

```bash
pnpm run dev
```

### 构建

```bash
pnpm run build
```

## 集成到扩展中

WebView UI构建后会生成静态文件，这些文件会被复制到扩展的`dist/webview-ui`目录中。

扩展启动时，会通过`TranslationEditorProvider`加载这些静态文件。

## 目录结构

- `src/` - 源代码
  - `components/` - Vue组件
  - `App.vue` - 主应用组件
  - `main.js` - 应用入口点
  - `style.css` - 全局样式（使用Tailwind CSS）
- `public/` - 静态资源
- `dist/` - 构建输出（不包含在版本控制中）
- `vite.config.js` - Vite配置
- `tailwind.config.js` - Tailwind CSS配置
