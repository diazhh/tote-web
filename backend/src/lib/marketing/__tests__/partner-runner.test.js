import { describe, test, expect, jest } from '@jest/globals';
import { runDailyDondeJugar } from '../partner-runner.js';

describe('runDailyDondeJugar', () => {
  test('renders a 1080x1920 story and publishes to IG/FB/Telegram with a 4-link caption', async () => {
    const calls = {};
    const deps = {
      render: jest.fn().mockResolvedValue(Buffer.from('png')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      findGameBySlug: jest.fn().mockResolvedValue({ id: 'game-1' }),
      publication: {
        publishStoryToChannels: jest.fn((gameId, p, fn, caption, opts) => {
          calls.story = { gameId, fn, caption, opts };
          return Promise.resolve({ success: true, results: [] });
        }),
      },
    };

    const res = await runDailyDondeJugar({ date: '2026-06-22', family: 'lotoanimalito' }, deps);

    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1920 }));
    expect(calls.story.gameId).toBe('game-1');
    expect(calls.story.opts.channelTypes).toEqual(['INSTAGRAM', 'FACEBOOK', 'TELEGRAM']);
    expect(calls.story.caption).toContain('→'); // bullets with links
    expect(calls.story.fn).toMatch(/^dondejugar_lotoanimalito_\d{8}_story\.png$/);
    expect(res.success).toBe(true);
  });
});
