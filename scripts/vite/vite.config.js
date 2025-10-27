import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import replace from '@rollup/plugin-replace'
import liveReload from 'vite-plugin-live-reload'
import { resolvePkgPath } from '../rollup/utils'
import path from 'path'

const myReact = true
// const myReact = false

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    replace({
      __DEV__: true,
      __EXPERIMENTAL__: false,
      __PROFILE__: true,
      preventAssignment: true
    }),
    liveReload([
      // '../../packages/react/src/jsx/ReactJSXElement.ts'
    ])
  ],
  resolve: {
    alias: myReact ? [
      {
        find: 'shared',
        replacement: resolvePkgPath('shared')
      },
      {
        find: 'scheduler',
        replacement: resolvePkgPath('scheduler')
      },
      {
        find: 'react',
        replacement: resolvePkgPath('react')
      },
      {
        find: 'react-dom',
        replacement: resolvePkgPath('react-dom')
      },
      {
        find: 'react-reconciler',
        replacement: resolvePkgPath('react-reconciler')
      },
      {
        find: 'ReactDOMHostConfig',
        replacement: path.resolve(resolvePkgPath('react-dom'), './src/client/ReactDOMHostConfig.ts')
      },
    ] : []
  }
})
