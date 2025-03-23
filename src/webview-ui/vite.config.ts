import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  
  return {
    plugins: [vue(), cssInjectedByJsPlugin()],
    
    // 定义开发服务器配置
    server: {
      watch: {
        // 对这些文件的修改会触发HMR
        ignored: ['!**/node_modules/**']
      }
    },
    
    // 提供process.env的定义
    define: {
      'process.env': {
        NODE_ENV: mode
      }
    },
    
    build: {
      // 改变输出目录
      outDir: isDev ? '../webview-dist' : '../../dist/webview-ui',
      emptyOutDir: true,
      
      // 配置库模式
      lib: {
        entry: resolve(__dirname, './src/main.ts'),
        name: 'main',
        formats: ['es'],
        fileName: () => 'main.js'
      },
      
      // 压缩选项
      minify: !isDev,
      
      rollupOptions: {
        output: {
          // 不要代码分割
          inlineDynamicImports: true,
          manualChunks: undefined,
          entryFileNames: 'main.js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === 'style.css') {
              return 'main.css';
            }
            return assetInfo.name || '';
          }
        }
      }
    }
  };
});
