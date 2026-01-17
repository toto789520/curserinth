
# Curserinth (MultiMC Export)

A CLI tool to convert CurseForge modpacks (`.zip`) into **MultiMC** importable instances.

## Dependencies

You need [Bun](https://bun.sh) to run this project.
### Windows installation bun with winget
```bash
winget install Bun
```

## Installation

```bash
bun install
```

## Usage

### 1. Check Modpack Information

To see details about the modpack without downloading anything:

```bash
bun run index.ts <modpack.zip>
```

### 2. Convert to MultiMC

This command will download all mods, apply overrides (configs), sort shaderpacks, and generate a `.zip` file ready to be imported into MultiMC.

**Syntax:**

```bash
bun run index.ts <input_modpack.zip> <output_directory>
```

**Example:**

```bash
bun run index.ts "BetterMC.zip" "./build"
```

Once finished, you will find a file named `ModpackName-MMC-Export.zip` in the output directory.

### 3. Import into MultiMC

1. Open **MultiMC** (or Prism Launcher).
2. Drag and drop the generated `.zip` file into the MultiMC window.
3. Click **OK**.
4. Launch the instance!

## Features

* **API Integration:** Downloads mod files directly from CurseForge.
* **Safety Checks:** Skips files that have been deleted or archived on CurseForge to prevent crashes.
* **Smart Sorting:** Automatically detects **Shaderpacks** (.zip shaders) and moves them to the `shaderpacks` folder instead of `mods`.
* **Metadata Generation:** Automatically creates `mmc-pack.json` and `instance.cfg` with the correct Modloader (Forge/Fabric/NeoForge/Quilt) and Minecraft version.
* **Overrides:** Handles config files and scripts correctly.