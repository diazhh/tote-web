import { describe, test, expect, jest, afterEach } from '@jest/globals';
import twitterService from '../twitter.service.js';

afterEach(() => jest.restoreAllMocks());

describe('twitterService.replyTweet', () => {
  test('posts a reply with in_reply_to_tweet_id and returns tweetId', async () => {
    jest.spyOn(twitterService, 'getInstance').mockResolvedValue({ instanceId: 'x', apiKey: 'a', apiSecret: 'b', accessToken: 'c', accessSecret: 'd' });
    const tweet = jest.fn().mockResolvedValue({ data: { id: '999' } });
    jest.spyOn(twitterService, '_buildClient').mockResolvedValue({ v2: { tweet } });
    jest.spyOn(twitterService, 'updateLastSeen').mockResolvedValue(undefined);

    const res = await twitterService.replyTweet('x', 'hola', '123');
    expect(res).toEqual({ success: true, tweetId: '999' });
    expect(tweet).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hola',
      reply: { in_reply_to_tweet_id: '123' },
    }));
  });

  test('returns controlled failure on error', async () => {
    jest.spyOn(twitterService, 'getInstance').mockRejectedValue(new Error('boom'));
    const res = await twitterService.replyTweet('x', 'hola', '123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('boom');
  });
});
