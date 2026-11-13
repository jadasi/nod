import { compileFromFile } from 'json-schema-to-typescript';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ts = await compileFromFile(resolve(root, 'decision.schema.json'), {
  bannerComment: '/* Generated from decision.schema.json. Do not edit. */',
  additionalProperties: false,
});
mkdirSync(resolve(root, 'src/generated'), { recursive: true });
writeFileSync(resolve(root, 'src/generated/decision.ts'), ts);
