import yauzl, { Entry, ZipFile } from "yauzl"
import * as fs from "fs"
import * as path from "path"
import archiver from "archiver"

// --- Interfaces ---
interface Response {
    data: ModFile
}

interface ModFile {
    id: number,
    fileName: string,
    projectId: number,
}

interface Manifest {
    "overrides": string,
    "minecraft": {
        "version": string,
        "modLoaders": ModLoader[]
    },
    "name": string,
    "version": string,
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

// --- Helpers ---

const mkdirp = (dir: string): Promise<void> => {
    return new Promise((resolve) => {
        fs.mkdir(dir, { recursive: true }, () => resolve())
    })
}

const zipDirectory = (sourceDir: string, outPath: string): Promise<void> => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .directory(sourceDir, false) 
            .on('error', err => reject(err))
            .pipe(stream);

        stream.on('close', () => resolve());
        archive.finalize();
    });
}

// Génération du mmc-pack.json
const createMultiMCMeta = (manifest: Manifest) => {
    const mcVersion = manifest.minecraft.version;
    const modLoaderRaw = manifest.minecraft.modLoaders.find(ml => ml.primary)?.id || "";
    
    let loaderUid = "";
    let loaderVersion = "";

    if (modLoaderRaw.startsWith("forge-")) {
        loaderUid = "net.minecraftforge";
        loaderVersion = modLoaderRaw.replace("forge-", "");
    } else if (modLoaderRaw.startsWith("fabric-")) {
        loaderUid = "net.fabricmc.fabric-loader";
        loaderVersion = modLoaderRaw.replace("fabric-", "");
    } else if (modLoaderRaw.startsWith("quilt-")) {
        loaderUid = "org.quiltmc.quilt-loader";
        loaderVersion = modLoaderRaw.replace("quilt-", "");
    } else if (modLoaderRaw.startsWith("neoforge-")) {
         loaderUid = "net.neoforged"; 
         loaderVersion = modLoaderRaw.replace("neoforge-", "");
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
    };
}

const createInstanceCfg = (name: string, mcVersion: string) => {
    return `InstanceType=OneSix
name=${name}
notes=Imported via OtterScript
IntendedVersion=${mcVersion}
`;
}

const [input, outputDirArg] = process.argv.slice(2)
const outputDir = outputDirArg ? path.resolve(outputDirArg) : null;

const download = async () => {
    if (!outputDir) return;

    const tempRoot = path.join(path.dirname(outputDir), ".otter_temp");
    const extractPath = path.join(tempRoot, "extracted");
    
    await mkdirp(extractPath);

    console.log(`Extraction de ${input}...`);

    yauzl.open(input, { lazyEntries: true }, async (err, zipfile: ZipFile) => {
        if (err || !zipfile) throw err

        zipfile.readEntry()
        zipfile.on("entry", async (entry: Entry) => {
            const fullPath = path.join(extractPath, entry.fileName);
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
            processManifestAndDownload();
        })
    })

    const downloadFile = async (file: File, modsDir: string, shadersDir: string) => {
        try {
            let fileDir = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}`)
            
            //404 si le fichier est supprimé
            if (!fileDir.ok) {
                 console.warn(`[SKIP] Fichier introuvable (Erreur ${fileDir.status}) pour ID: ${file.projectID}`);
                 return;
            }
            
            let fileJson: any = await fileDir.json();

            // Vérification de la validité des données
            if (!fileJson || !fileJson.data) {
                console.warn(`[SKIP] Données API invalides pour le projet ${file.projectID} (Fichier peut-être supprimé ou privé).`);
                return;
            }

            let fileName = fileJson.data.fileName
            
            // Détection simple des Shaders pour les mettre au bon endroit
            let finalDir = modsDir;
            if (fileName.toLowerCase().includes("shader") && fileName.endsWith(".zip")) {
                finalDir = shadersDir;
                console.log(`Shader détecté: ${fileName} -> shaderpacks`);
            }

            const destPath = path.join(finalDir, fileName);
            if (fs.existsSync(destPath)) return;

            let fileWeb = await fetch(`https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}/download`)
            if (!fileWeb.ok) throw new Error(`Erreur DL: ${fileWeb.status}`);
            
            await Bun.write(destPath, await fileWeb.blob())
        } catch (e) {
            console.error(`Echec du téléchargement pour le projet ${file.projectID}:`, e);
        }
    }

    const processManifestAndDownload = async () => {
        const manifestPath = path.join(extractPath, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
            console.error("Manifest.json introuvable !");
            return;
        }

        const manifest: Manifest = await Bun.file(manifestPath).json()
        
        // Création de la structure pour MultiMC qui imite un Export Instance
        // Le nom du dossier sera le nom du modpack nettoyé
        const safeName = manifest.name.replace(/[^a-z0-9_-]/gi, '');
        const buildRoot = path.join(tempRoot, "mmc_build");
        const instanceRoot = path.join(buildRoot, safeName); // Dossier racine "NomModpack"
        const minecraftPath = path.join(instanceRoot, ".minecraft");
        const modsPath = path.join(minecraftPath, "mods");
        const shadersPath = path.join(minecraftPath, "shaderpacks");

        await mkdirp(modsPath);
        await mkdirp(shadersPath);

        // 1. Création des fichiers de configuration MultiMC
        console.log("Création des métadonnées MultiMC...");
        const mmcPack = createMultiMCMeta(manifest);
        await Bun.write(path.join(instanceRoot, "mmc-pack.json"), JSON.stringify(mmcPack, null, 4));

        const instanceCfg = createInstanceCfg(manifest.name, manifest.minecraft.version);
        await Bun.write(path.join(instanceRoot, "instance.cfg"), instanceCfg);

        // 2. Téléchargement des mods
        console.log(`Téléchargement de ${manifest.files.length} fichiers...`);
        const batchSize = 10;
        for (let i = 0; i < manifest.files.length; i += batchSize) {
            const batch = manifest.files.slice(i, i + batchSize);
            await Promise.all(batch.map(file => downloadFile(file, modsPath, shadersPath)));
        }

        // 3. Copie des overrides (configs, etc)
        if (manifest.overrides) {
            const overridesPath = path.join(extractPath, manifest.overrides);
            if (fs.existsSync(overridesPath)) {
                console.log("Copie des fichiers overrides...");
                fs.cpSync(overridesPath, minecraftPath, { recursive: true });
            }
        }

        // 4. Compression finale
        console.log("Compression de l'archive finale...");
        await mkdirp(outputDir); 
        
        const zipName = `${safeName}-MMC-Export.zip`;
        const finalZipPath = path.join(outputDir, zipName);
        
        // On zippe le contenu de "mmc_build", qui contient le dossier "NomModpack"
        await zipDirectory(buildRoot, finalZipPath);
        
        cleanup(tempRoot);
        console.log(`\nTerminé ! Importable MultiMC créé : \n${finalZipPath}`);
    }

    const cleanup = (dir: string) => {
        try {
           fs.rmSync(dir, { recursive: true, force: true });
        } catch(e) {}
    }
}

if (input && outputDirArg) {
    download()
} else {
    console.log("Usage: bun index.ts <input.zip> <outputDir>")
}