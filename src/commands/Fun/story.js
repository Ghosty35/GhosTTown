// commands/fun/story.js
//
// /story status  -> see the story so far + time left in the round
// /story finish  -> (admin) end the round early
// /story topic   -> (admin) set the topic for the NEXT round
// /story channel -> (admin) set which channel the game runs in
//
// Members add words by just typing a single word as a normal message in
// the configured story channel — see events/storyMessage.js for that.
//
// This file is auto-discovered by handlers/commandLoader.js — just having
// it in the commands folder is enough, no manual registration needed.

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import {
  getStory,
  setStoryChannel,
  setNextTopic,
  finalizeStory,
  STORY_DURATION_MS,
} from '../../services/storyService.js';

const data = new SlashCommandBuilder()
  .setName('story')
  .setDescription('Play the collaborative one-word-at-a-time story game')
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('See the current story so far')
  )
  .addSubcommand((sub) =>
    sub.setName('finish').setDescription('(Admin) End the current round right now')
  )
  .addSubcommand((sub) =>
    sub
      .setName('topic')
      .setDescription('(Admin) Set the topic for the NEXT round')
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Topic text').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('(Admin) Set the channel where the story game runs')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel').setRequired(true)
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const client = interaction.client;

  if (sub === 'status') {
    const story = await getStory(client, guildId);
    const msRemaining = Math.max(0, story.startedAt + STORY_DURATION_MS - Date.now());
    const daysRemaining = (msRemaining / (24 * 60 * 60 * 1000)).toFixed(1);
    const lastUser = story.words.length
      ? story.words[story.words.length - 1].username
      : 'nobody yet';

    const embed = new EmbedBuilder()
      .setTitle(`📖 Current Story — Topic: ${story.topic}`)
      .setDescription(
        story.words.length
          ? story.words.map((w) => w.word).join(' ')
          : '*No words yet — be the first!*'
      )
      .addFields(
        { name: 'Words so far', value: `${story.words.length}`, inline: true },
        { name: 'Last contributor', value: lastUser, inline: true },
        { name: 'Time left in round', value: `${daysRemaining} days`, inline: true }
      )
      .setColor(0x8a2be2);

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'finish') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: '❌ You need the Manage Server permission to do that.',
        ephemeral: true,
      });
    }
    await finalizeStory(client, guildId);
    return interaction.reply({ content: '✅ Round finalized early and a new one has started.' });
  }

  if (sub === 'topic') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: '❌ You need the Manage Server permission to do that.',
        ephemeral: true,
      });
    }
    const text = interaction.options.getString('text').trim();
    await setNextTopic(client, guildId, text);
    return interaction.reply({
      content: `✅ Got it — the next round's topic will be: "${text}"`,
      ephemeral: true,
    });
  }

  if (sub === 'channel') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: '❌ You need the Manage Server permission to do that.',
        ephemeral: true,
      });
    }
    const channel = interaction.options.getChannel('channel');
    await setStoryChannel(client, guildId, channel.id);
    return interaction.reply({
      content: `✅ Story game channel set to ${channel}.`,
      ephemeral: true,
    });
  }
}

export default { data, execute };
