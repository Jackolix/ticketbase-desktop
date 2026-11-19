import { describe, expect, it } from 'vitest';
import { buildManifest } from './updater-manifest.js';

const ALL = {
  'ticketsystem-desktop_1.5.0_x64-setup.exe': 'sig-nsis\n',
  'ticketsystem-desktop_1.5.0_x64_en-US.msi': 'sig-msi',
  'ticketsystem-desktop_aarch64.app.tar.gz': 'sig-arm',
  'ticketsystem-desktop_x64.app.tar.gz': 'sig-intel',
  'ticketsystem-desktop_1.5.0_amd64.AppImage': 'sig-appimage',
  'ticketsystem-desktop_1.5.0_amd64.deb': 'sig-deb',
  'ticketsystem-desktop-1.5.0-1.x86_64.rpm': 'sig-rpm',
};

const build = (signatures = ALL) =>
  buildManifest({
    tag: 'v1.5.0',
    repository: 'owner/repo',
    signatures,
    notes: 'notes',
    pubDate: '2026-11-19T10:00:00.000Z',
  });

describe('buildManifest', () => {
  it('produces every key the 1.4.0 manifest had', () => {
    expect(Object.keys(build().platforms).sort()).toEqual(
      [
        'darwin-aarch64',
        'darwin-aarch64-app',
        'darwin-x86_64',
        'darwin-x86_64-app',
        'linux-x86_64',
        'linux-x86_64-appimage',
        'linux-x86_64-deb',
        'linux-x86_64-rpm',
        'windows-x86_64',
        'windows-x86_64-msi',
        'windows-x86_64-nsis',
      ].sort(),
    );
  });

  it('points Windows at the NSIS installer and trims signatures', () => {
    const { version, platforms } = build();
    expect(version).toBe('1.5.0');
    expect(platforms['windows-x86_64']).toEqual({
      signature: 'sig-nsis',
      url: 'https://github.com/owner/repo/releases/download/v1.5.0/ticketsystem-desktop_1.5.0_x64-setup.exe',
    });
  });

  it('refuses a manifest that would leave a platform without the update', () => {
    const withoutWindows = Object.fromEntries(
      Object.entries(ALL).filter(([name]) => !name.includes('x64-setup')),
    );
    expect(() => build(withoutWindows)).toThrow(/windows-x86_64/);
  });
});
