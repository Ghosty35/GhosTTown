// storyService.js
//
// Collaborative "one word at a time" story game.
// Follows the same conventions as birthdayService.js:
//  - state is stored via client.db.get/set (per-guild keys)
//  - a checkX(client) function loops all guilds, meant to be called by cron
//
// -----------------------------------------------------------------------
// CONFIG — edit to taste
// -----------------------------------------------------------------------
const STORY_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days per round

// How long a member must wait after posting a word before posting another.
// Any message they send in the story channel during this window gets
// deleted automatically (handled in events/storyMessage.js).
const WORD_COOLDOWN_MS = 60 * 1000; // 1 minute

// Topics are used in order, then loop back to the start. An admin can
// override the *next* round's topic with /story topic.
const TOPIC_POOL = [
  "A door that shouldn't exist",
  'The last bus of the night',
  'A letter that arrives 20 years late',
  'The town where clocks run backwards',
  'Something found at the bottom of the lake',
];

import { logger } from '../utils/logger.js';

// -----------------------------------------------------------------------
// DB KEY HELPERS
// -----------------------------------------------------------------------
function storyKey(guildId) {
  return `story:${guildId}`;
}
function archiveKey(guildId) {
  return `story-archive:${guildId}`;
}
function configKey(guildId) {
  return `story-config:${guildId}`;
}

function freshStory(topicIndex = 0, overrideTopic = null) {
  return {
    topic: overrideTopic || TOPIC_POOL[topicIndex % TOPIC_POOL.length],
    words: [],
    startedAt: Date.now(),
    topicIndex: topicIndex % TOPIC_POOL.length,
    nextTopicOverride: null,
    userCooldowns: {}, // { userId: timestamp of their last accepted word }
  };
}

// -----------------------------------------------------------------------
// CONFIG (which channel the game runs in, per guild)
// -----------------------------------------------------------------------
export async function getStoryConfig(client, guildId) {
  return (await client.db.get(configKey(guildId))) || { channelId: null };
}

export async function setStoryChannel(client, guildId, channelId) {
  const config = await getStoryConfig(client, guildId);
  config.channelId = channelId;
  await client.db.set(configKey(guildId), config);
  return config;
}

// -----------------------------------------------------------------------
// STORY STATE
// -----------------------------------------------------------------------
export async function getStory(client, guildId) {
  let story = await client.db.get(storyKey(guildId));
  if (!story) {
    story = freshStory(0);
    await client.db.set(storyKey(guildId), story);
  }
  return story;
}

export function validateWord(word) {
  // Single word only: letters, numbers, apostrophes, hyphens.
  return /^[A-Za-z0-9'-]+$/.test(word);
}

/**
 * Returns how many milliseconds remain before this user can post again,
 * or 0 if they're free to go. Lets the message handler decide whether to
 * delete a message BEFORE even checking if it's a valid word.
 */
export function getUserCooldownRemaining(story, userId) {
  const lastPosted = story.userCooldowns?.[userId];
  if (!lastPosted) return 0;
  const remaining = lastPosted + WORD_COOLDOWN_MS - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Attempts to add a word to the current story.
 * Returns { success: true, story } or { success: false, reason }
 * reason is one of: 'INVALID_WORD', 'COOLDOWN'
 */
export async function addWord(client, guildId, userId, username, rawWord) {
  const word = (rawWord || '').trim();

  if (!validateWord(word)) {
    return { success: false, reason: 'INVALID_WORD' };
  }

  const story = await getStory(client, guildId);
  story.userCooldowns = story.userCooldowns || {};

  const remaining = getUserCooldownRemaining(story, userId);
  if (remaining > 0) {
    return { success: false, reason: 'COOLDOWN', remaining };
  }

  story.words.push({ word, userId, username, timestamp: Date.now() });
  story.userCooldowns[userId] = Date.now();
  await client.db.set(storyKey(guildId), story);

  return { success: true, story };
}

export async function setNextTopic(client, guildId, text) {
  const story = await getStory(client, guildId);
  story.nextTopicOverride = text;
  await client.db.set(storyKey(guildId), story);
  return story;
}

// -----------------------------------------------------------------------
// FINALIZATION
// -----------------------------------------------------------------------
export async function finalizeStory(client, guildId) {
  const story = await getStory(client, guildId);

  const finished = {
    topic: story.topic,
    words: story.words,
    startedAt: story.startedAt,
    finishedAt: Date.now(),
    fullText: story.words.map((w) => w.word).join(' '),
    contributors: [...new Set(story.words.map((w) => w.username))],
  };

  const archive = (await client.db.get(archiveKey(guildId))) || [];
  archive.push(finished);
  await client.db.set(archiveKey(guildId), archive);

  const config = await getStoryConfig(client, guildId);

  if (config.channelId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(config.channelId).catch(() => null);
      if (channel) {
        await channel.send({
          embeds: [
            {
              title: `📚 Story complete: "${story.topic}"`,
              description:
                finished.fullText || '*(No words were submitted this round.)*',
              fields: [
                {
                  name: 'Contributors',
                  value: finished.contributors.join(', ') || 'None',
                },
              ],
              color: 0x2ecc71,
              footer: { text: `${finished.words.length} words total` },
            },
          ],
        });
      }
    } catch (error) {
      logger.error(`Error posting finished story for guild ${guildId}:`, error);
    }
  }

  const nextIndex = story.topicIndex + 1;
  const nextStory = freshStory(nextIndex, story.nextTopicOverride);
  await client.db.set(storyKey(guildId), nextStory);

  if (config.channelId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(config.channelId).catch(() => null);
      if (channel) {
        await channel.send(
          `✨ A new story round has begun! Topic: **${nextStory.topic}**\nJust type a single word in this channel to add the first word.`
        );
      }
    } catch (error) {
      logger.error(`Error announcing new story round for guild ${guildId}:`, error);
    }
  }

  return nextStory;
}

/**
 * Meant to be called on a cron schedule (see app.js setupCronJobs).
 * Checks every guild's story round and finalizes any that have run past
 * STORY_DURATION_MS, same pattern as checkBirthdays / checkGiveaways.
 */
export async function checkStoryExpiration(client) {
  for (const [guildId] of client.guilds.cache) {
    try {
      const story = await getStory(client, guildId);
      const expired = Date.now() - story.startedAt >= STORY_DURATION_MS;
      if (expired) {
        logger.info(`Story round expired for guild ${guildId}, finalizing...`);
        await finalizeStory(client, guildId);
      }
    } catch (error) {
      logger.error(`Error checking story expiration for guild ${guildId}:`, error);
    }
  }
}

export { STORY_DURATION_MS, WORD_COOLDOWN_MS, TOPIC_POOL };
