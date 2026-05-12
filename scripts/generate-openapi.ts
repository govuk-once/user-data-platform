import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';
import { generateOpenApiDocument } from '../libs/utils/schemas/openApi/opeanApiRegistry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_PATH = path.resolve(__dirname, '../docs/openapi.yml');
const DOCS_DIR = path.dirname(OUTPUT_PATH);

console.log('test');

async function main(): Promise<number> {
  try {
    if (!fs.existsSync(DOCS_DIR)) {
      fs.mkdirSync(DOCS_DIR, { recursive: true });
    }

    const document = generateOpenApiDocument();

    const yamlContent = yaml.stringify(document, {
      indent: 2,
      lineWidth: 120,
      singleQuote: true,
    });

    const header = `# OpenApi Specification
# Generated automatically from zod schemas
# DO NOT EDIT THIS MANUALLY
#
# to regenerate run pnpm generate:openapi
`;

    const fullContent = header + yamlContent;

    fs.writeFileSync(OUTPUT_PATH, fullContent, 'utf-8');

    // const parsed = yaml.parse(yamlContent);
    // const pathCount = Object.keys(parsed.paths || {}).length;

    return 0;
  } catch (error) {
    console.error('Failed to generate OpenApi Spec', error);
    return 1;
  }
}

main().then((code) => process.exit(code));
