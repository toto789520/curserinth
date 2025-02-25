# curserinth

## To install dependencies:

```bash
bun install
```

## To run:

Note: In order for the program to work correctly, you must first make a profile in the Modrinth launcher with the same Modloader and Minecraft version as the modpack you are trying to install. You can get this data by running the modpack version command.

Warning: The program downloads all the files from the manifest to the `mods` folder, meaning some resource packs may be in the `mods` folder.

### To retrieve the modpack version:
```bash
bun run index.ts <modpack.zip>

# Example:
Modpack Name: FTB OceanBlock 2
Minecraft Version: 1.21.1
Total Mods: 277
Modloader: neoforge-21.1.115
```

### To install the modpack:
Profile is the path to the profile in the Modrinth launcher. (Ex. `C:\Users\<name>\AppData\Roaming\ModrinthApp\profiles\<profile>`)
You can also retrieve the profile path by running the Modrinth launcher and selecting the three dots inside the profile you want to install the modpack to and click `Open folder`.

Note: Make sure that when you copy the path, it is escaped with backslashes correctly. You can make sure of this by going to the `profiles` parent folder, right clicking on the profile you want to install the modpack to, and clicking `Copy as path`. 

```bash
bun run index.ts <modpack.zip> <profile>
```