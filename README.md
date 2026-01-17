# curserinth

## To install dependencies:

```bash
bun install
```

## To run:

Warning: The program downloads all the files from the manifest to the `mods` folder, meaning some resource packs may be in the `mods` folder.

### Basic Usage:

```bash
bun run index.ts <modpack.zip> <output-directory> <loader>
```

#### Parameters:

- `modpack.zip` - Path to your modpack zip file
- `output-directory` - Directory where the modpack will be extracted
- `loader` - Which loader to use:
  - `1` or `multimc` - Use MultiMC loader format
  - `2` or `modrinth` - Use Modrinth launcher format
  - `all` - Extract for both loaders

### Examples:

#### Using MultiMC (option 1):
```bash
bun run index.ts '.\Modpack-CureForge.zip' .\pack 1
```

#### Using Modrinth (option 2):
```bash
bun run index.ts '.\Modpack-CureForge.zip' .\pack 2
```

#### Using both loaders:
```bash
bun run index.ts '.\Modpack-CureForge.zip' .\pack all
```

#### Alternatively, you can use loader names:
```bash
bun run index.ts '.\Modpack-CureForge.zip' .\pack multimc
bun run index.ts '.\Modpack-CureForge.zip' .\pack modrinth
```

### Help:

If you run the command without the proper arguments, the program will display a help message:

```bash
bun run index.ts
```