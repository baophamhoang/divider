import { describe, it, expect } from 'vitest';
import { extractDriveId, driveImageSrc, isAllowedQrUrl } from './qr';

describe('extractDriveId', () => {
  it('pulls the id from the common Drive link shapes', () => {
    expect(extractDriveId('https://drive.google.com/file/d/ABC123_-xy/view?usp=sharing')).toBe('ABC123_-xy');
    expect(extractDriveId('https://drive.google.com/open?id=ABC123_-xy')).toBe('ABC123_-xy');
    expect(extractDriveId('https://drive.google.com/uc?export=view&id=ABC123_-xy')).toBe('ABC123_-xy');
    expect(extractDriveId('https://drive.google.com/thumbnail?id=ABC123_-xy&sz=w1000')).toBe('ABC123_-xy');
    expect(extractDriveId('https://lh3.googleusercontent.com/d/ABC123_-xy')).toBe('ABC123_-xy');
  });

  it('returns null when there is no id', () => {
    expect(extractDriveId('https://drive.google.com/drive/folders/')).toBeNull();
    expect(extractDriveId('https://example.com/nope')).toBeNull();
  });
});

describe('driveImageSrc', () => {
  it('builds a thumbnail src from a Drive link', () => {
    expect(driveImageSrc('https://drive.google.com/file/d/ABC123/view')).toBe(
      'https://drive.google.com/thumbnail?id=ABC123&sz=w1000',
    );
    expect(driveImageSrc('https://drive.google.com/open?id=ABC123', 600)).toBe(
      'https://drive.google.com/thumbnail?id=ABC123&sz=w600',
    );
  });

  it('returns null when no id is present', () => {
    expect(driveImageSrc('https://drive.google.com/')).toBeNull();
  });
});

describe('isAllowedQrUrl', () => {
  it('accepts https Google Drive/Docs/CDN links', () => {
    expect(isAllowedQrUrl('https://drive.google.com/file/d/ABC/view')).toBe(true);
    expect(isAllowedQrUrl('https://docs.google.com/document/d/ABC/edit')).toBe(true);
    expect(isAllowedQrUrl('https://lh3.googleusercontent.com/d/ABC')).toBe(true);
  });

  it('rejects non-Google hosts, http, look-alikes, junk, and over-length', () => {
    expect(isAllowedQrUrl('https://example.com/x')).toBe(false);
    expect(isAllowedQrUrl('http://drive.google.com/file/d/ABC/view')).toBe(false); // not https
    expect(isAllowedQrUrl('https://drive.google.com.evil.com/x')).toBe(false); // suffix attack
    expect(isAllowedQrUrl('https://evilgoogleusercontent.com/x')).toBe(false); // missing dot
    expect(isAllowedQrUrl('not a url')).toBe(false);
    expect(isAllowedQrUrl(null)).toBe(false);
    expect(isAllowedQrUrl('https://drive.google.com/' + 'a'.repeat(2048))).toBe(false); // too long
  });
});
