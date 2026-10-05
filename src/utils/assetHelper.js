// Display URL for a hero portrait. Root-relative ("/assets/...") so it resolves from any
// route depth: a bare "assets/..." breaks under nested paths such as /workspace-debug/play.
// Stored values stay in the bare "assets/characters/<name>.webp" form (see storedProfilePicture).
export const resolveProfilePicture = (path) => {
    const stored = storedProfilePicture(path);
    return stored ? `/${stored}` : null;
};

// Canonical STORED form of a portrait value: "assets/characters/<name>.webp". Normalises
// legacy values ("barbarian.png") and tolerates a leading slash.
export const storedProfilePicture = (path) => {
    if (!path) return null;
    path = String(path).replace(/^\/+/, '');

    // Already in the stored format
    if (path.includes('assets/characters/') && path.endsWith('.webp')) {
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
