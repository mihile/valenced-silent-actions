from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json, subprocess
manifest = json.loads(Path('plugins/silent-actions/manifest.json').read_text(encoding='utf-8'))
pool = Path('pool')
pool.mkdir(exist_ok=True)
archive = pool / f"{manifest['id']}@{manifest['version']}.zip"
if archive.exists():
    raise SystemExit(f'{archive} already exists; increment the version')
subprocess.run(['bun', '--bun', 'run', 'build'], check=True, shell=True)
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    z.write('plugins/silent-actions/manifest.json', 'manifest.json')
    z.write('plugins/silent-actions/build/js/index.js', 'index.js')
subprocess.run(['bun', '--bun', 'node_modules/@valenced/plugin-cli/src/main.ts', 'generate-index', '--dist', 'pool', '--base-url', 'https://mihile.github.io/valenced-silent-actions/pool', '--out', 'index.json'], check=True, shell=True)
