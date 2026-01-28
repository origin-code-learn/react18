import generatePackageJson from 'rollup-plugin-generate-package-json'
import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils' // 修正导入方法名

const { name, module } = getPackageJSON('react') // 修正方法名
const pkgPath = resolvePkgPath(name)
const pkgDistPath = resolvePkgPath(name, true)

const config = [
    // react 核心包
    {
        input: path.join(pkgPath, module), // 替换字符串拼接，兼容 PNPM
        output: {
            file: path.join(pkgDistPath, 'index.js'),
            name: 'React', // 显式声明全局变量名，避免 PNPM 隔离下全局变量丢失
            format: 'umd',
            globals: { // 修复：声明外部依赖的全局变量映射（PNPM 隔离下必须显式指定）
                'shared': 'shared',
                'scheduler': 'scheduler',
                'react-reconciler': 'react-reconciler',
                'react-dom': 'react-dom',
                'jsxDEV': 'jsxDEV',
                'jsxRuntime': 'jsxRuntime',
            }
        },
        plugins: [
            ...getBaseRollupPlugins(),
            generatePackageJson({
                inputFolder: pkgPath,
                outputFolder: pkgDistPath,
                baseContents: (pkgJson) => ({ // 修复：继承完整的包配置，适配 PNPM 模块解析
                    name: pkgJson.name,
                    description: pkgJson.description,
                    version: pkgJson.version,
                    main: 'index.js',
                    module: pkgJson.module,
                    type: 'module', // 显式声明 ESModule，避免 PNPM 解析为 CommonJS
                    peerDependencies: pkgJson.peerDependencies || {},
                    dependencies: pkgJson.dependencies || {}
                })
            })
        ],
        // 修复：PNPM 下 external 仅排除 node_modules 第三方包，不排除本地 packages 模块
        external: (id) => {
            // 只排除 node_modules 中的依赖，本地包不排除（避免双模块）
            return !id.startsWith('.') && !id.startsWith('/') && !id.includes('packages/');
        },
    },
    // jsx-runtime
    {
        input: path.join(pkgPath, 'src/jsx/ReactJSX.ts'), // 替换字符串拼接
        output: [
            {
                file: path.join(pkgDistPath, 'jsx-runtime.js'),
                name: 'jsxRuntime',
                format: 'umd',
                globals: { // 同上，声明全局变量映射
                    'react': 'react',
                    'shared': 'shared',
                    'scheduler': 'scheduler'
                }
            },
            {
                file: path.join(pkgDistPath, 'jsx-dev-runtime.js'),
                name: 'jsxDEV',
                format: 'umd',
                globals: {
                    'react': 'react',
                    'shared': 'shared',
                    'scheduler': 'scheduler'
                }
            },
        ],
        plugins: getBaseRollupPlugins(),
        external: (id) => { // 统一 external 规则
            return !id.startsWith('.') && !id.startsWith('/') && !id.includes('packages/');
        },
    }
]

export default config