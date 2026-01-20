import yauzl, { Entry, ZipFile } from "yauzl"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

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
            if (err) {
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

    const cleanup = () => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (e) {
            // Ignore cleanup errors - temp directory may have already been removed or locked
        }
    }

    yauzl.open(input, { lazyEntries: true }, async (err, zipfile: ZipFile) => {
        if (err || !zipfile) {
            console.error("Failed to open modpack file:", err)
            cleanup()
            throw err
        }

        zipfile.readEntry()
        zipfile.on("entry", async (entry: Entry) => {
            const fullPath = path.join(tempDir, entry.fileName)

            if (entry.fileName.endsWith("/")) {
                await mkdirp(fullPath)
                zipfile.readEntry()
            } else {
                await mkdirp(path.dirname(fullPath))
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err || !readStream) {
                        console.error("Failed to open read stream for entry:", entry.fileName, err)
                        // Attempt to continue with the next entry instead of throwing inside a callback
                        zipfile.readEntry()
                        return
                    }
                    const writeStream = fs.createWriteStream(fullPath)
                    const handleStreamError = (streamErr: unknown) => {
                        console.error("Stream error while extracting entry:", entry.fileName, streamErr)
                        try {
                            readStream.destroy()
                        } catch {
                            // ignore secondary errors during cleanup
                        }
                        try {
                            writeStream.close()
                        } catch {
                            // ignore secondary errors during cleanup
                        }
                        // Move on to the next entry even if this one failed
                        zipfile.readEntry()
                    }
                    readStream.on("error", handleStreamError)
                    writeStream.on("error", handleStreamError)
                    writeStream.on("close", () => {
                        zipfile.readEntry()
                    })
                    readStream.pipe(writeStream)
                })
            }
        })
        zipfile.on("end", () => {
            downloadModpack()
        })
    })

    const downloadFile = async (file: File, location: string) => {
        try {
            let fileMetadataResponse = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}`)
            if (!fileMetadataResponse.ok) {
                console.warn(`[SKIP] File not found (Error ${fileMetadataResponse.status}) for ID: ${file.projectID}`)
                return
            }
            let fileJson: Response = await fileMetadataResponse.json()
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

    const createMultiMCMeta = (manifest: Manifest) => {
        const mcVersion = manifest.minecraft.version
        const modLoaderRaw = manifest.minecraft.modLoaders.find(ml => ml.primary)?.id || ""
        
        let loaderUid = ""
        let loaderVersion = ""

        if (modLoaderRaw.startsWith("forge-")) {
            loaderUid = "net.minecraftforge"
            loaderVersion = modLoaderRaw.replace("forge-", "")
        } else if (modLoaderRaw.startsWith("fabric-")) {
            loaderUid = "net.fabricmc.fabric-loader"
            loaderVersion = modLoaderRaw.replace("fabric-", "")
        } else if (modLoaderRaw.startsWith("quilt-")) {
            loaderUid = "org.quiltmc.quilt-loader"
            loaderVersion = modLoaderRaw.replace("quilt-", "")
        } else if (modLoaderRaw.startsWith("neoforge-")) {
            loaderUid = "net.neoforged"
            loaderVersion = modLoaderRaw.replace("neoforge-", "")
        } else {
            if (!modLoaderRaw) {
                throw new Error("No primary mod loader found in manifest.minecraft.modLoaders")
            }
            throw new Error(`Unsupported mod loader id: ${modLoaderRaw}`)
        }

        return {
            components: [
                {
                    uid: "net.minecraft",
                    version: mcVersion,
                    important: true
                },
                {
                    uid: loaderUid,
                    version: loaderVersion
                }
            ],
            formatVersion: 1
        }
    }

    const createInstanceCfg = (name: string) => {
        return `InstanceType=OneSix
name=${name}
`
    }

    const downloadModpack = async () => {
        const manifestPath = path.join(tempDir, "manifest.json")
        if (!fs.existsSync(manifestPath)) {
            console.error("manifest.json not found!")
            cleanup()
            throw new Error(`manifest.json not found at expected path: ${manifestPath}`)
        }

        const manifest: Manifest = await Bun.file(manifestPath).json()
        
        // Create MultiMC-style directory structure
        // Use hash of manifest name to ensure uniqueness if multiple packs have similar names
        const hash = crypto.createHash('md5').update(manifest.name).digest('hex').substring(0, 8)
        const safeName = manifest.name.replace(/[^a-z0-9_-]/gi, '_').substring(0, 32) + '_' + hash
        const instanceRoot = path.join(outputDir, safeName)
        const minecraftPath = path.join(instanceRoot, ".minecraft")
        const modsPath = path.join(minecraftPath, "mods")

        await mkdirp(modsPath)

        // Create MultiMC metadata files
        console.log("Creating MultiMC metadata...")
        const mmcPack = createMultiMCMeta(manifest)
        await Bun.write(path.join(instanceRoot, "mmc-pack.json"), JSON.stringify(mmcPack, null, 4))
        await Bun.write(path.join(instanceRoot, "instance.cfg"), createInstanceCfg(manifest.name))

        // Download mods
        console.log(`Downloading ${manifest.files.length} mods...`)
        const batchSize = 10
        for (let i = 0; i < manifest.files.length; i += batchSize) {
            const batch = manifest.files.slice(i, i + batchSize)
            await Promise.all(batch.map(file => downloadFile(file, modsPath)))
        }

        // Copy overrides
        if (manifest.overrides) {
            const overridesPath = path.join(tempDir, manifest.overrides)
            if (fs.existsSync(overridesPath)) {
                console.log("Copying override files...")
                fs.cpSync(overridesPath, minecraftPath, { recursive: true })
            }
        }

        cleanup()
        console.log(`Done! MultiMC instance created at: ${instanceRoot}`)
    }
}

export const run = async (inputFile: string, outputDirectory: string) => {
    await download(inputFile, outputDirectory)
}