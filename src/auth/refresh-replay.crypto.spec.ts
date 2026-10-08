import { openRefreshToken, sealRefreshToken } from './refresh-replay.crypto';

describe('refresh-replay crypto', () => {
  const oldId = '3f2b7c9e-1d4a-4e8b-9c6f-0a1b2c3d4e5f';
  const oldSecret = 'old-secret-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-';
  const newRefreshToken =
    '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.new-secret-ZyXwVuTsRqPoNmLkJiHgFeDcBa';

  describe('when the caller presents the same old token', () => {
    it('gets the exact new refresh token back', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(openRefreshToken(oldId, oldSecret, sealed)).toBe(newRefreshToken);
    });

    it('can open the same sealed value more than once', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(openRefreshToken(oldId, oldSecret, sealed)).toBe(newRefreshToken);
      expect(openRefreshToken(oldId, oldSecret, sealed)).toBe(newRefreshToken);
    });

    it('returns each token to its own sealed value', () => {
      const otherNewToken = 'another-id.another-secret';
      const sealedA = sealRefreshToken(oldId, oldSecret, newRefreshToken);
      const sealedB = sealRefreshToken(oldId, oldSecret, otherNewToken);

      expect(openRefreshToken(oldId, oldSecret, sealedA)).toBe(newRefreshToken);
      expect(openRefreshToken(oldId, oldSecret, sealedB)).toBe(otherNewToken);
    });

    it('preserves any text, including long and non-ASCII values', () => {
      const unusual = `${'x'.repeat(5000)}-ünïcödé-🔑`;
      const sealed = sealRefreshToken(oldId, oldSecret, unusual);

      expect(openRefreshToken(oldId, oldSecret, sealed)).toBe(unusual);
    });
  });

  describe('when the caller does not hold the old token', () => {
    it('refuses a wrong secret', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(openRefreshToken(oldId, 'a-different-secret', sealed)).toBeNull();
    });

    it('refuses a secret that only differs by one character', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);
      const almost = oldSecret.slice(0, -1) + 'X';

      expect(openRefreshToken(oldId, almost, sealed)).toBeNull();
    });

    it('refuses the right secret paired with a different token id', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);
      const otherId = '00000000-0000-4000-8000-000000000000';

      expect(openRefreshToken(otherId, oldSecret, sealed)).toBeNull();
    });
  });

  describe('when the stored value is damaged or forged', () => {
    it('refuses it if any character was changed', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      // The last characters of a base64url string can carry unused padding
      // bits, so changing them does not always change the decoded bytes.
      for (let i = 0; i < sealed.length - 2; i++) {
        const replacement = sealed[i] === 'A' ? 'B' : 'A';
        const tampered = sealed.slice(0, i) + replacement + sealed.slice(i + 1);

        expect(openRefreshToken(oldId, oldSecret, tampered)).toBeNull();
      }
    });

    it('refuses it if it was cut short', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(
        openRefreshToken(oldId, oldSecret, sealed.slice(0, -10)),
      ).toBeNull();
      expect(
        openRefreshToken(oldId, oldSecret, sealed.slice(0, 10)),
      ).toBeNull();
    });

    it('refuses it if something was appended', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(openRefreshToken(oldId, oldSecret, sealed + 'AAAA')).toBeNull();
    });

    it.each([
      ['an empty string', ''],
      ['a short string', 'abc'],
      ['text that is not base64url', '!!! not base64 !!!'],
      ['a plain refresh token', newRefreshToken],
    ])('refuses %s without throwing', (_label, input) => {
      expect(() => openRefreshToken(oldId, oldSecret, input)).not.toThrow();
      expect(openRefreshToken(oldId, oldSecret, input)).toBeNull();
    });

    it('does not accept a value sealed for a different old token', () => {
      const otherSealed = sealRefreshToken(
        '11111111-1111-4111-8111-111111111111',
        'someone-elses-secret',
        'someone-elses.new-token',
      );

      expect(openRefreshToken(oldId, oldSecret, otherSealed)).toBeNull();
    });
  });

  describe('what is safe to store in the database', () => {
    it('does not contain the new refresh token in readable form', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);
      const secretPart = newRefreshToken.split('.')[1];

      expect(sealed).not.toContain(secretPart);
      expect(sealed).not.toContain(newRefreshToken);
      expect(Buffer.from(sealed, 'base64url').toString('utf8')).not.toContain(
        secretPart,
      );
    });

    it('is plain text that fits a text column', () => {
      const sealed = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('produces a different value each time, yet both open correctly', () => {
      const first = sealRefreshToken(oldId, oldSecret, newRefreshToken);
      const second = sealRefreshToken(oldId, oldSecret, newRefreshToken);

      expect(first).not.toBe(second);
      expect(openRefreshToken(oldId, oldSecret, first)).toBe(newRefreshToken);
      expect(openRefreshToken(oldId, oldSecret, second)).toBe(newRefreshToken);
    });
  });
});
