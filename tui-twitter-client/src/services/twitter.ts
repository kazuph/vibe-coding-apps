import { Effect, Context, Layer } from 'effect';
import { TwitterApi, TweetV2, TweetV2TimelineResult } from 'twitter-api-v2';
import type { Tweet, TwitterConfig } from '../types/tweet.js';

// Service interface
export interface TwitterService {
  postTweet: (text: string) => Effect.Effect<Tweet, Error>;
  getTimeline: (count?: number) => Effect.Effect<Tweet[], Error>;
  getUserTweets: (userId: string, count?: number) => Effect.Effect<Tweet[], Error>;
}

// Service tag for dependency injection
export class TwitterServiceTag extends Context.Tag('TwitterService')<
  TwitterServiceTag,
  TwitterService
>() {}

// Convert TwitterApi TweetV2 to our Tweet type
const convertTweet = (tweet: TweetV2, includes?: any): Tweet => {
  const author = includes?.users?.find((u: any) => u.id === tweet.author_id) || {
    id: tweet.author_id || 'unknown',
    username: 'unknown',
    name: 'Unknown User'
  };

  return {
    id: tweet.id,
    text: tweet.text,
    author: {
      id: author.id,
      username: author.username,
      name: author.name
    },
    createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
    metrics: tweet.public_metrics ? {
      retweets: tweet.public_metrics.retweet_count || 0,
      likes: tweet.public_metrics.like_count || 0,
      replies: tweet.public_metrics.reply_count || 0
    } : undefined
  };
};

// Live implementation
export const TwitterServiceLive = (config: TwitterConfig): Layer.Layer<TwitterServiceTag> => {
  const client = new TwitterApi({
    appKey: config.apiKey,
    appSecret: config.apiSecret,
    accessToken: config.accessToken,
    accessSecret: config.accessSecret,
  });

  const rwClient = client.readWrite;

  return Layer.succeed(
    TwitterServiceTag,
    {
      postTweet: (text: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await rwClient.v2.tweet(text);
            // Fetch the full tweet data
            const tweetData = await rwClient.v2.singleTweet(result.data.id, {
              expansions: ['author_id'],
              'tweet.fields': ['created_at', 'public_metrics'],
              'user.fields': ['username', 'name']
            });
            return convertTweet(tweetData.data, tweetData.includes);
          },
          catch: (error) => new Error(`Failed to post tweet: ${error}`)
        }),

      getTimeline: (count = 20) =>
        Effect.tryPromise({
          try: async () => {
            const timeline = await rwClient.v2.homeTimeline({
              max_results: Math.min(count, 100),
              expansions: ['author_id'],
              'tweet.fields': ['created_at', 'public_metrics'],
              'user.fields': ['username', 'name']
            });
            return timeline.data.data?.map(tweet => convertTweet(tweet, timeline.data.includes)) || [];
          },
          catch: (error) => new Error(`Failed to fetch timeline: ${error}`)
        }),

      getUserTweets: (userId: string, count = 20) =>
        Effect.tryPromise({
          try: async () => {
            const tweets = await rwClient.v2.userTimeline(userId, {
              max_results: Math.min(count, 100),
              expansions: ['author_id'],
              'tweet.fields': ['created_at', 'public_metrics'],
              'user.fields': ['username', 'name']
            });
            return tweets.data.data?.map(tweet => convertTweet(tweet, tweets.data.includes)) || [];
          },
          catch: (error) => new Error(`Failed to fetch user tweets: ${error}`)
        })
    }
  );
};
