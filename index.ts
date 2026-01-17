import * as modrinth from "../modrinth"
import * as multimc from "../multimc"

const [input, outputDir, loaderParam] = process.argv.slice(2)

const showHelp = () => {
    console.error(`
Usage: bun run index.ts <input.zip> <outputDir> [loader]

Arguments:
  input.zip      Path to the modpack zip file
  outputDir      Output directory for the extracted modpack
  loader         Loader type (optional):
                 1, multimc   - Use MultiMC loader
                 2, modrinth  - Use Modrinth loader
                 all          - Use both loaders

Examples:
  bun run index.ts './modpack.zip' './output' 1
  bun run index.ts './modpack.zip' './output' multimc
  bun run index.ts './modpack.zip' './output' 2
  bun run index.ts './modpack.zip' './output' modrinth
  bun run index.ts './modpack.zip' './output' all
`)
    process.exit(1)
}

if (!input || !outputDir || !loaderParam) {
    showHelp()
}

const loader = loaderParam.toLowerCase()

if (!['1', '2', 'multimc', 'modrinth', 'all'].includes(loader)) {
    console.error(`Error: Invalid loader type "${loaderParam}"`)
    showHelp()
}

const runLoader = async (loaderType: string) => {
    console.log(`Starting ${loaderType} extraction...`)
    
    if (loaderType === 'multimc' || loaderType === '1') {
        await multimc.run(input, outputDir)
    } else if (loaderType === 'modrinth' || loaderType === '2') {
        await modrinth.run(input, outputDir)
    }
}

const main = async () => {
    try {
        if (loader === 'all') {
            await runLoader('multimc')
            await runLoader('modrinth')
        } else {
            await runLoader(loader)
        }
    } catch (error) {
        console.error('Error:', error)
        process.exit(1)
    }
}

main()
