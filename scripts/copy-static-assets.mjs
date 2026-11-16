import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectRoot = process.cwd();
const copies = [
  [
    resolve(projectRoot, 'node_modules/@esri/calcite-components/dist/cdn'),
    resolve(projectRoot, 'dist/calcite-assets'),
  ],
  [
    resolve(projectRoot, 'node_modules/@arcgis/core/assets'),
    resolve(projectRoot, 'dist/arcgis-assets'),
  ],
];

for (const [source, destination] of copies) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

console.log('Copied Calcite and ArcGIS assets into the static build output.');
