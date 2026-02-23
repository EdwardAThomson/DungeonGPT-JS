/**
 * Download utility — trigger a browser file download.
 *
 * Ported from src/utils/fileHelper.js.
 * Typed with `unknown` for data to prevent accidental `any` leakage.
 */

export function downloadJSONFile(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
