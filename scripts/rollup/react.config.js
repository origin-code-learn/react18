import generatePackageJson from 'rollup-plugin-generate-package-json'
import { getPackageJOSN, resolvePkgPath, getBaseRollupPlugins } from './utils'

const { name, module } = getPackageJOSN('react')
const pkgPath = resolvePkgPath(name)
const pkgDistPath = resolvePkgPath(name, true)

const config = [
    // react
    {
        input: `${pkgPath}/${module}`,
        output: {
            file: `${pkgDistPath}/index.js`,
            name: 'index.js',
            format: 'umd'
        },
        plugins:[
            ...getBaseRollupPlugins(), 
            generatePackageJson({
                inputFolder: pkgPath,
                outputFolder: pkgDistPath,
                baseContents: ({name, description, version}) => ({
                    name,
                    description,
                    version,
                    main: 'index.js'
                })
            })
        ]
    },
    // jsx-runtime
    {
        input: `${pkgPath}/src/jsx/ReactJSX.ts`,
        output: [
            {
                file: `${pkgDistPath}/jsx-runtime.js`,
                name: 'jsx-runtime.js',
                format: 'umd'
            },
            {
                file: `${pkgDistPath}/jsx-dev-runtime.js`,
                name: 'jsx-dev-runtime.js',
                format: 'umd'
            },
        ],
        plugins: getBaseRollupPlugins()
    }
]

export default config