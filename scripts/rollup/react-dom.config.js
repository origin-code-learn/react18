import generatePackageJson from 'rollup-plugin-generate-package-json'
import alias from '@rollup/plugin-alias'
import { getPackageJOSN, resolvePkgPath, getBaseRollupPlugins } from './utils'

const { name, module } = getPackageJOSN('react-dom')
const pkgPath = resolvePkgPath(name)
const pkgDistPath = resolvePkgPath(name, true)

const config = [
    // react
    {
        input: `${pkgPath}/${module}`,
        output: [
            {
                file: `${pkgDistPath}/index.js`,
                name: 'index.js',
                format: 'umd'
            },
            {
                file: `${pkgDistPath}/client.ts`,
                name: 'client.js',
                format: 'umd'
            }
        ],
        plugins:[
            ...getBaseRollupPlugins(), 
            alias({
                entries: {
                    hostConfig: `${pkgPath}/src/hostConfig.ts`
                }
            }),
            generatePackageJson({
                inputFolder: pkgPath,
                outputFolder: pkgDistPath,
                baseContents: ({name, description, version}) => ({
                    name,
                    description,
                    version,
                    main: 'index.js',
                    peerDependencies: {
                        react: version
                    }
                })
            })
        ]
    },
    // jsx-runtime
    // {
    //     input: `${pkgPath}/src/jsx/ReactJSX.ts`,
    //     output: [
    //         {
    //             file: `${pkgDistPath}/jsx-runtime.js`,
    //             name: 'jsx-runtime.js',
    //             format: 'umd'
    //         },
    //         {
    //             file: `${pkgDistPath}/jsx-dev-runtime.js`,
    //             name: 'jsx-dev-runtime.js',
    //             format: 'umd'
    //         },
    //     ],
    //     plugins: getBaseRollupPlugins()
    // }
]

export default config