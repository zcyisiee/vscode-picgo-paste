import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUploadSettings, parseSeeUploadResponse } from './provider-config';

test('defaults provider to s.ee when config is missing', () => {
    const settings = resolveUploadSettings({
        autoUploadOnPaste: true
    }, {});

    assert.equal(settings.provider, 's.ee');
});

test('prefers SEE_API_TOKEN from env over seeApiKey setting', () => {
    const settings = resolveUploadSettings({
        provider: 's.ee',
        seeApiKey: 'setting-token',
        autoUploadOnPaste: true
    }, {
        SEE_API_TOKEN: 'env-token'
    });

    assert.equal(settings.seeApiKey, 'env-token');
});

test('falls back to seeApiKey setting when env token is absent', () => {
    const settings = resolveUploadSettings({
        provider: 's.ee',
        seeApiKey: 'setting-token',
        autoUploadOnPaste: true
    }, {});

    assert.equal(settings.seeApiKey, 'setting-token');
});

test('parses successful s.ee upload response url', () => {
    const url = parseSeeUploadResponse({
        success: true,
        code: 200,
        data: {
            url: 'https://i.see.you/2026/02/11/dm3K/my-cat.jpg'
        }
    });

    assert.equal(url, 'https://i.see.you/2026/02/11/dm3K/my-cat.jpg');
});

test('returns null for unsuccessful s.ee upload response', () => {
    const url = parseSeeUploadResponse({
        success: false,
        message: 'invalid token'
    });

    assert.equal(url, null);
});
