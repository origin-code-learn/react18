import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import replace from '@rollup/plugin-replace'
import liveReload from 'vite-plugin-live-reload'
import { resolvePkgPath } from '../rollup/utils'
import path from 'path'

const myReact = true

export default defineConfig({
  plugins: [
    react(),
    // 修复1：环境变量转为字符串（PNPM 下模块解析严格，布尔值会报错）
    replace({
      values: { // 显式用 values 字段，兼容 rollup-plugin-replace 新版本
        __DEV__: JSON.stringify(true),
        __EXPERIMENTAL__: JSON.stringify(false),
        __PROFILE__: JSON.stringify(true),
      },
      preventAssignment: true
    }),
    // 修复2：开启本地包热更新，监听所有源码文件
    liveReload([
      '../../packages/**/*.ts',
      '../../packages/**/*.tsx'
    ])
  ],
  resolve: {
    alias: myReact ? [
      // 修复3：所有别名使用绝对路径，避免 PNPM 路径解析歧义
      {
        find: 'shared',
        replacement: path.resolve(resolvePkgPath('shared')),
      },
      {
        find: 'scheduler',
        replacement: path.resolve(resolvePkgPath('scheduler')),
      },
      {
        find: 'react',
        replacement: path.resolve(resolvePkgPath('react')),
      },
      {
        find: 'react-dom',
        replacement: path.resolve(resolvePkgPath('react-dom')),
      },
      {
        find: 'react-reconciler',
        replacement: path.resolve(resolvePkgPath('react-reconciler')),
      },
      {
        find: 'ReactDOMHostConfig',
        replacement: path.resolve(resolvePkgPath('react-dom'), './src/client/ReactDOMHostConfig.ts'),
      },
    ] : [],
    // 修复4：禁用 PNPM 的优化依赖预构建（核心！避免 Vite 预构建第三方 react 导致双模块）
    dedupe: ['react', 'react-dom', 'shared', 'scheduler', 'react-reconciler'], // 强制去重
  },
  // 修复5：Vite 服务配置，允许访问 PNPM 隔离的目录
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '../../'), // 允许访问根目录
        resolvePkgPath(''), // 允许访问 packages 目录
        path.resolve(__dirname, '../../dist'), // 允许访问打包产物目录
      ],
    },
  },
  // 新增：强制使用 ESModule 解析，对齐 Rollup 配置
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  // 新增：PNPM 下禁用依赖优化的路径拼接
  preserveSymlinks: true,
  // 修复6：优化依赖配置，跳过本地包的预构建
  optimizeDeps: {
    // exclude: ['react', 'react-dom', 'shared', 'scheduler', 'react-reconciler'], // 关键：排除本地仿写包
    disabled: true, // 禁用依赖预构建
    force: true, // 强制刷新预构建缓存
    entries: ['src/**/*.ts', 'src/**/*.tsx'],
  },
})