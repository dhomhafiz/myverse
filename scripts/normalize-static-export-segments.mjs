import { constants } from 'node:fs';
import { copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = 'out';

async function copySegmentFiles(directory, routeDirectory, filenameParts) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await copySegmentFiles(entryPath, routeDirectory, [...filenameParts, entry.name]);
      continue;
    }

    if (!entry.name.endsWith('.txt')) {
      throw new Error(`Unexpected static segment payload: ${entryPath}`);
    }

    const filename = [...filenameParts, entry.name.slice(0, -4)].join('.') + '.txt';
    await copyFile(entryPath, path.join(routeDirectory, filename), constants.COPYFILE_EXCL);
  }
}

async function normalizeExportSegments(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith('__next.')) {
      await copySegmentFiles(entryPath, directory, [entry.name]);
    } else {
      await normalizeExportSegments(entryPath);
    }
  }
}

await normalizeExportSegments(outputDirectory);
