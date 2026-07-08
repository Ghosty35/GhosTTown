// events/storyMessage.js
//
// Lets members add a word to the story game by just typing it as a normal
// message in the configured story channel — no slash command needed.
//
// Cooldown behavior: after a word is accepted, that member has 60 seconds
// before they can post again. Any message they send in the story channel
// during that cooldown gets deleted automatically.
//
// Auto-discovered by handlers/events.js — filename doesn't matter, only
// the `name` field below (which Discord event to listen for). This file
// MUST live in src/events/ — handlers/events.js only scans that folder.

import { getStoryConfig, addWord, getStory, getUserCooldownRemaining } from '../services/storyService.js';

export default {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Ignore bots (including this bot) and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // Only act inside the channel an admin set with /story channel
    const config = await getStoryConfig(client, message.guild.id);
    if (!config.channelId || message.channel.id !== config.channelId) return;

    const content = message.content.trim();

    // Ignore anything that looks like a command for another part of the bot
    if (/^[!?./]/.test(content)) return;

    // Check cooldown FIRST, before validating the word itself — a message
    // sent during cooldown gets deleted no matter what it says.
    const story = await getStory(client, message.guild.id);
    const remaining = getUserCooldownRemaining(story, message.author.id);

    if (remaining > 0) {
      await message.delete().catch(() => {});

      const seconds = Math.ceil(remaining / 1000);
      const notice = await message.channel
        .send(`⏳ ${message.author.toString()}, please wait **${seconds}s** before adding another word.`)
        .catch(() => null);

      if (notice) {
        setTimeout(() => notice.delete().catch(() => {}), 4000);
      }
      return;
    }

    const result = await addWord(
      client,
      message.guild.id,
      message.author.id,
      message.author.username,
      content
    );

    if (!result.success) {
      if (result.reason === 'INVALID_WORD') {
        await message.react('❌').catch(() => {});
        setTimeout(() => message.delete().catch(() => {}), 4000);
      }
      return;
    }

    await message.react('✅').catch(() => {});
  },
};
