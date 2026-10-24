import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import unittest

spec = importlib.util.spec_from_file_location('release_package', Path(__file__).parents[1]/'scripts/package.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def fixture(self, root):
        build = root/'dist'
        for name in release.STATIC_FILES | {'assets/options-test.js', 'assets/options-test.css'}:
            p = build/name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('fixture')
        (build/'manifest.json').write_text('{"version":"0.1.0"}')
        for name in ('options.html','popup.html'):
            (build/name).write_text('<script src="/assets/options-test.js"></script><link href="/assets/options-test.css">')
        return build

    def test_only_approved_distribution_files_are_packaged(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            build = self.fixture(root)
            archive = release.package(build, root/'artifacts')
            with ZipFile(archive) as z:
                self.assertEqual(len(z.namelist()), 18)
                for name in z.namelist():
                    self.assertEqual(z.read(name), (build/name.removeprefix('Roblox Cinema/')).read_bytes())

    def test_unexpected_file_prevents_archive_creation(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            build = self.fixture(root)
            (build/'private-note.txt').write_text('must stay local')
            with self.assertRaises(ValueError):
                release.package(build, root/'artifacts')
            self.assertFalse((root/'artifacts').exists())

    def test_store_archive_has_root_manifest_and_same_allowlist(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            build = self.fixture(root)
            archive = release.package(build, root/'artifacts', store=True)
            with ZipFile(archive) as z:
                self.assertIn('manifest.json', z.namelist())
                self.assertEqual(len(z.namelist()), 18)
                for name in z.namelist():
                    self.assertEqual(z.read(name), (build/name).read_bytes())

    def test_symlink_is_rejected(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            build = self.fixture(root)
            (build/'linked.txt').symlink_to(build/'manifest.json')
            with self.assertRaises(ValueError):
                release.package(build, root/'artifacts')

    def test_development_manifest_cannot_be_released(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            build = self.fixture(root)
            (build/'manifest.json').write_text('{"version":"0.1.0","version_name":"0.1.0 development"}')
            with self.assertRaisesRegex(ValueError, 'Development builds'):
                release.package(build, root/'artifacts')


if __name__ == '__main__':
    unittest.main()
