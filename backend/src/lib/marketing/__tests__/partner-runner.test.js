import { describe, test, expect, jest } from '@jest/globals';
import { runDailyDondeJugar, runTwitterDirectorio } from '../partner-runner.js';

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

describe('runTwitterDirectorio', () => {
  test('posts root with image then chains the thread replies', async () => {
    const tweetIds = ['root', 'r1', 'r2', 'r3', 'r4'];
    let i = 0;
    const replyCalls = [];
    const deps = {
      render: jest.fn().mockResolvedValue(Buffer.from('png')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      findGameBySlug: jest.fn().mockResolvedValue({ id: 'game-1' }),
      findTwitterChannels: jest.fn().mockResolvedValue([{ name: 'tw', twitterInstanceId: 'inst-1' }]),
      twitter: {
        publishTweet: jest.fn().mockResolvedValue({ success: true, tweetId: tweetIds[i++] }),
        replyTweet: jest.fn((instanceId, text, inReplyTo) => {
          replyCalls.push(inReplyTo);
          return Promise.resolve({ success: true, tweetId: tweetIds[i++] });
        }),
      },
    };

    const res = await runTwitterDirectorio({ family: 'lottopantera' }, deps);

    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1350 }));
    expect(deps.twitter.publishTweet).toHaveBeenCalledWith('inst-1', expect.stringContaining('¿Dónde jugar?'), expect.stringContaining('/api/public/images/results/dondejugar_lottopantera_directorio.png'));
    // first reply chains off root, second off the first reply, etc.
    expect(replyCalls[0]).toBe('root');
    expect(replyCalls[1]).toBe('r1');
    expect(res.results[0]).toMatchObject({ channel: 'tw', success: true, rootTweetId: 'root' });
  });
});
