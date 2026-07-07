// events/storyMessage.js
//
// Lets users add a word to the story game by just typing it as a normal
// message in the configured story channel — no slash command needed.
//
// The /story word subcommand still works too (it calls the same addWord
// function), so nothing breaks if someone uses it out of habit.
//
// Auto-discovered by handlers/events.js — filename doesn't matter, only
// the `name` field below (which Discord event to listen for).

import { getStoryConfig, addWord } from '../services/storyService.js';

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
      } else if (result.reason === 'SAME_USER') {
        await message.react('⏳').catch(() => {});
      }
      // Clean up the rejected message after a few seconds so the channel
      // stays readable as a running story. Remove this block if you'd
      // rather leave rejected messages in place.
      setTimeout(() => message.delete().catch(() => {}), 4000);
      return;
    }

    await message.react('✅').catch(() => {});
  },
};
