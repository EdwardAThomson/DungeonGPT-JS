export const resolveProfilePicture = (path) => {
    if (!path) return null;

    // If it already contains the correct new format, return it
    if (path.includes('assets/characters/') && path.endsWith('.webp')) {
        // Make sure it has a leading slash or not, depending on app structure. 
        // In HeroCreation it is saved as "assets/characters/barbarian.webp"
        return path;
    }

    // Extract the filename without extension
    let filename = path;
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
        filename = path.substring(lastSlashIndex + 1);
    }

    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex !== -1) {
        filename = filename.substring(0, dotIndex);
    }

    // Return with the new format
    return `assets/characters/${filename}.webp`;
};
