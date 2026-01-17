import yauzl, { Entry, ZipFile } from "yauzl"
import * as fs from "fs"
import * as path from "path"

interface Response {
    data: ModFile
}

interface ModFile {
    id: number,
    dateCreated: string,
    dateModified: string,
    displayName: string,
    fileLength: number,
    fileName: string,
    status: number,
    projectId: number,
    gameVersions: string[],
    gameVersionTypeIds: number[],
    releaseType: number,
    totalDownloads: number,
    user: {
        id: number,
        username: string,
        twitchAvatarUrl: string,
        displayName: string,
    },
    additionalFilesCount: number,
    hasServerPack: boolean,
    additionalServerPackFilesCount: number,
    isEarlyAccessContent: boolean,
    isCompatibleWithClient: boolean,
}

interface Manifest {
    "overrides": string,
    "minecraft": {
        "version": string,
        "modLoaders": ModLoader[]
    },
    "manifestType": string,
    "manifestVersion": number,
    "name": string,
    "version": string,
    "author": string,
    "files": File[]
}

interface ModLoader {
    "primary": boolean,
    "id": string
}

interface File {
    "projectID": number,
    "fileID": number,
    "required": boolean
}

const mkdirp = (dir: string): Promise<void> => {
    return new Promise((resolve) => {
        fs.mkdir(dir, { recursive: true }, () => resolve())
    })
}

const [input, outputDir] = process.argv.slice(2)

const version = () => {
    yauzl.open(input, { lazyEntries: true }, async (err, zipfile: ZipFile) => {
        if (err || !zipfile) throw err

        zipfile.readEntry()
        zipfile.on("entry", async (entry: Entry) => {
            if (entry.fileName === "manifest.json") {
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err || !readStream) throw err

                    let rawData = ''
                    readStream.on('data', (chunk) => {
                        rawData += chunk
                    })

                    readStream.on('end', () => {
                        const manifest: Manifest = JSON.parse(rawData)
                        console.log("Modpack Name:", manifest.name)
                        console.log("Minecraft Version:", manifest.minecraft.version)
                        console.log("Total Mods:", manifest.files.length)
                        console.log("Modloader:", manifest.minecraft.modLoaders[0].id)

                        zipfile.close()
                    })
                })
            } else {
                zipfile.readEntry()
            }
        })
    })
}

const download = async () => {
    // Temp Directory
    const tempDir = `${outputDir}/.otter`
    await mkdirp(tempDir)

    yauzl.open(input, { lazyEntries: true }, async (err, zipfile: ZipFile) => {
        if (err || !zipfile) throw err

        zipfile.readEntry()
        zipfile.on("entry", async (entry: Entry) => {
            const fullPath = `${tempDir}/${entry.fileName}`

            if (entry.fileName.endsWith("/")) {
                await mkdirp(fullPath)
                zipfile.readEntry()
            } else {
                await mkdirp(path.dirname(fullPath))
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err || !readStream) throw err
                    const writeStream = fs.createWriteStream(fullPath)
                    readStream.pipe(writeStream)
                    writeStream.on("close", () => zipfile.readEntry())
                })
            }
        })
        zipfile.on("end", () => {
            downloadModpack()
        })
    })

    const downloadFile = async (file: File, location: string) => {
        let fileDir = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}`)
        let fileJson: Response = await fileDir.json()
        let fileName = fileJson.data.fileName
        let fileWeb = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}/download`)
        Bun.write(`${location}/${fileName}`, await fileWeb.blob())
    }

    const downloadModpack = async () => {
        const manifest: Manifest = await Bun.file(`${tempDir}/manifest.json`).json()
        const downloadPromises = manifest.files.map(file => downloadFile(file, `${outputDir}/mods`))
        await Promise.all(downloadPromises)
        if (manifest.overrides) {
            const overridesPath = `${tempDir}/${manifest.overrides}`
            if (fs.existsSync(overridesPath)) {
                fs.cpSync(overridesPath, outputDir, { recursive: true })
            }
        }
        cleanup()
        console.log("Done!")
    }

    const cleanup = () => {
        fs.rmdirSync(tempDir, { recursive: true })
    }
}

export const run = async (inputFile: string, outputDirectory: string) => {
    const input = inputFile
    const outputDir = outputDirectory
    await download()
}