"""Package an explicit extension allowlist; unexpected files fail the release."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json
import re

STATIC_FILES = {
    'manifest.json', 'content.js', 'theme.css', 'glass.js', 'background.js',
    'preferences.js', 'options.html', 'popup.html', 'NOTICE.md',
    'icons/16.png', 'icons/32.png', 'icons/128.png',
    'licenses/React.txt', 'licenses/ReactDOM.txt',
    'licenses/LiquidGlass.txt', 'licenses/Lucide.txt',
}


def package(build: Path, output: Path) -> Path:
    if build.is_symlink():
        raise ValueError('Build directory must not be a symlink')
    actual = set()
    for file in build.rglob('*'):
        if file.is_symlink():
            raise ValueError('Symlinks are not permitted in releases')
        if file.is_file():
            actual.add(file.relative_to(build).as_posix())
    assets = set()
    for name in ('options.html', 'popup.html'):
        for asset in re.findall(r'(?:src|href)=["\'](/?assets/[^"\']+)', (build/name).read_text()):
            asset = asset.lstrip('/')
            if not re.fullmatch(r'assets/options-[A-Za-z0-9_-]+\.(?:js|css)', asset):
                raise ValueError('Unrecognized options asset')
            assets.add(asset)
    if len(assets) != 2 or {Path(a).suffix for a in assets} != {'.js', '.css'}:
        raise ValueError('Expected one options script and one stylesheet')
    expected = STATIC_FILES | assets
    if actual != expected:
        raise ValueError(f'Release allowlist mismatch: extra={sorted(actual-expected)}, missing={sorted(expected-actual)}')
    version = json.loads((build/'manifest.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    output.mkdir(parents=True, exist_ok=True)
    destination = output/f'Roblox-Cinema-{version}.zip'
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED) as archive:
        for name in sorted(expected):
            archive.write(build/name, Path('Roblox Cinema')/name)
    return destination


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    print(package(root/'dist', root/'artifacts'))
