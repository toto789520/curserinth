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
    return new Promise((resolve, reject) => {
        fs.mkdir(dir, { recursive: true }, (err) => {
            if (err && err.code !== "EEXIST") {
                return reject(err)
            }
            resolve()
        })
    })
}

const download = async (input: string, outputDir: string) => {
    // Temp Directory for extraction
    const tempDir = path.join(outputDir, ".otter")
    await mkdirp(tempDir)

    console.log("Extracting modpack...")

    yauzl.open(input, { lazyEntries: true }, async (err, zipfile: ZipFile) => {
        if (err || !zipfile) throw err

        zipfile.readEntry()
        zipfile.on("entry", async (entry: Entry) => {
            const fullPath = path.join(tempDir, entry.fileName)

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
        try {
            let fileDir = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}`)
            if (!fileDir.ok) {
                console.warn(`[SKIP] File not found (Error ${fileDir.status}) for ID: ${file.projectID}`)
                return
            }
            let fileJson: Response = await fileDir.json()
            let fileName = fileJson.data.fileName
            
            const destPath = path.join(location, fileName)
            if (fs.existsSync(destPath)) return

            let fileWeb = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}/download`)
            if (!fileWeb.ok) {
                console.warn(`[SKIP] Download failed (Error ${fileWeb.status}) for: ${fileName}`)
                return
            }
            await Bun.write(destPath, await fileWeb.blob())
        } catch (e) {
            console.error(`Failed to download file for project ${file.projectID}:`, e)
        }
    }

    const downloadModpack = async () => {
        const manifestPath = path.join(tempDir, "manifest.json")
        if (!fs.existsSync(manifestPath)) {
            console.error("manifest.json not found!")
            return
        }

        const manifest: Manifest = await Bun.file(manifestPath).json()
        const modsDir = path.join(outputDir, "mods")
        await mkdirp(modsDir)

        console.log(`Downloading ${manifest.files.length} mods...`)
        const batchSize = 10
        for (let i = 0; i < manifest.files.length; i += batchSize) {
            const batch = manifest.files.slice(i, i + batchSize)
            await Promise.all(batch.map(file => downloadFile(file, modsDir)))
        }

        // Copy overrides
        if (manifest.overrides) {
            const overridesPath = path.join(tempDir, manifest.overrides)
            if (fs.existsSync(overridesPath)) {
                console.log("Copying override files...")
                fs.cpSync(overridesPath, outputDir, { recursive: true })
            }
        }

        cleanup()
        console.log("Done! Modpack extracted to:", outputDir)
    }

    const cleanup = () => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

export const run = async (inputFile: string, outputDirectory: string) => {
    await download(inputFile, outputDirectory)
}