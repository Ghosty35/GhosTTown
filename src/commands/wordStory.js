/**
 * wordStory.js
 * ---------------------------------------------------------------------------
 * A collaborative "one word at a time" story game for a Discord bot.
 *
 * HOW IT WORKS
 *  - Users run `/story word <word>` to add exactly one word to the story.
 *  - The same person can't go twice in a row — they must wait until someone
 *    else contributes before they can add another word.
 *  - The current story round runs for 7 days (configurable below). Once the
 *    time is up, the bot automatically posts the finished story, archives it,
 *    and starts a new round with a new topic.
 *  - `/story status` shows the current topic, word count, and time left.
 *  - `/story finish` (admin only) manually ends the round early.
 *  - `/story topic <text>` (admin only) sets the topic for the *next* round.
 *
 * REQUIREMENTS
 *  - discord.js v14+
 *  - Node.js 18+ (uses built-in fs/promises)
 *
 * ---------------------------------------------------------------------------
 * HOW TO WIRE THIS INTO YOUR EXISTING BOT
 * ---------------------------------------------------------------------------
 * 1) Drop this file in your commands folder (e.g. commands/wordStory.js).
 *
 * 2) In your main index.js, where you load/register slash commands, add this
 *    file's `data` export the same way you do for your other commands, and
 *    route interactions to its `execute` function.
 *
 * 3) In index.js, once the client is ready, call `initStoryGame(client)`
 *    ONE time so the 7-day auto-check timer starts running. Example:
 *
 *      const { initStoryGame } = require('./commands/wordStory.js');
 *
 *      client.once('ready', () => {
 *        console.log(`Logged in as ${client.user.tag}`);
 *        initStoryGame(client);
 *      });
 *
 * 4) Edit the CONFIG block directly below to match your server
 *    (channel ID, story duration, topic list).
 * ---------------------------------------------------------------------------
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs/promises');
const path = require('path');

// ============================================================================
// CONFIG — edit these to fit your server
// ============================================================================
const CONFIG = {
  // Channel where words are submitted and the finished story gets posted.
  // Right-click a channel in Discord (dev mode on) -> Copy Channel ID.
  STORY_CHANNEL_ID: '1483155456649199677',

  // How long a round lasts before auto-finalizing. Change the first number.
  STORY_DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days

  // How often the bot checks whether the round has expired. Doesn't need to
  // be exact to the second, so checking every 15 min is plenty.
  CHECK_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes

  // Where state is saved on disk so it survives bot restarts/deploys.
  // NOTE: on Railway, the filesystem is ephemeral unless you attach a
  // persistent volume — if you redeploy without one, this file (and the
  // in-progress story) will reset. Attach a volume, or swap this for a
  // database, if you need the story to survive redeploys.
  STATE_FILE: path.join(__dirname, 'storyState.json'),
  ARCHIVE_FILE: path.join(__dirname, 'storyArchive.json'),

  // Topics used for each new round, picked in order, then looped.
  // An admin can also override the *next* topic with /story topic.
  TOPIC_POOL: [
    'A door that shouldn\'t exist',
    'The last bus of the night',
    'A letter that arrives 20 years late',
    'The town where clocks run backwards',
    'Something found at the bottom of the lake',
  ],
};

// ============================================================================
// STATE
// ============================================================================
// story: { topic, words: [{ word, userId, username, timestamp }], startedAt, topicIndex }
// archive: array of finished story objects
let story = null;
let archive = [];
let checkTimer = null;

async function loadState() {
  try {
    const raw = await fs.readFile(CONFIG.STATE_FILE, 'utf8');
    story = JSON.parse(raw);
  } catch (err) {
    story = null; // no saved state yet
  }
  try {
    const raw = await fs.readFile(CONFIG.ARCHIVE_FILE, 'utf8');
    archive = JSON.parse(raw);
  } catch (err) {
    archive = [];
  }
  if (!story) {
    story = startNewStoryObject(0);
    await saveState();
  }
}

async function saveState() {
  await fs.writeFile(CONFIG.STATE_FILE, JSON.stringify(story, null, 2));
}

async function saveArchive() {
  await fs.writeFile(CONFIG.ARCHIVE_FILE, JSON.stringify(archive, null, 2));
}

function startNewStoryObject(topicIndex, overrideTopic) {
  const topic =
    overrideTopic || CONFIG.TOPIC_POOL[topicIndex % CONFIG.TOPIC_POOL.length];
  return {
    topic,
    words: [],
    startedAt: Date.now(),
    topicIndex: topicIndex % CONFIG.TOPIC_POOL.length,
    nextTopicOverride: null,
  };
}

// ============================================================================
// SLASH COMMAND DEFINITION
// ============================================================================
const data = new SlashCommandBuilder()
  .setName('story')
  .setDescription('Play the collaborative one-word-at-a-time story game')
  .addSubcommand((sub) =>
    sub
      .setName('word')
      .setDescription('Add one word to the story')
      .addStringOption((opt) =>
        opt
          .setName('word')
          .setDescription('A single word to add')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('See the current story so far')
  )
  .addSubcommand((sub) =>
    sub
      .setName('finish')
      .setDescription('(Admin) End the current round right now')
  )
  .addSubcommand((sub) =>
    sub
      .setName('topic')
      .setDescription('(Admin) Set the topic for the NEXT round')
      .addStringOption((opt) =>
        opt
          .setName('text')
          .setDescription('Topic text')
          .setRequired(true)
      )
  );

// ============================================================================
// COMMAND HANDLER
// ============================================================================
async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'word') return handleWord(interaction);
  if (sub === 'status') return handleStatus(interaction);
  if (sub === 'finish') return handleFinish(interaction);
  if (sub === 'topic') return handleSetTopic(interaction);
}

async function handleWord(interaction) {
  const rawWord = interaction.options.getString('word').trim();

  // Must be a single word: letters, numbers, apostrophes, hyphens only.
  if (!/^[A-Za-z0-9'-]+$/.test(rawWord)) {
    return interaction.reply({
      content: '❌ Please submit exactly **one** word (no spaces or punctuation like . , !).',
      ephemeral: true,
    });
  }

  const lastEntry = story.words[story.words.length - 1];
  if (lastEntry && lastEntry.userId === interaction.user.id) {
    return interaction.reply({
      content: "⏳ You just added a word — wait for someone else to go before you add another.",
      ephemeral: true,
    });
  }

  story.words.push({
    word: rawWord,
    userId: interaction.user.id,
    username: interaction.user.username,
    timestamp: Date.now(),
  });
  await saveState();

  const preview = story.words.map((w) => w.word).join(' ');
  await interaction.reply({
    content: `✅ **${interaction.user.username}** added: "${rawWord}"\n\n📖 Story so far: ${preview}`,
  });
}

async function handleStatus(interaction) {
  const embed = buildStatusEmbed();
  return interaction.reply({ embeds: [embed] });
}

async function handleFinish(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need the Manage Server permission to do that.',
      ephemeral: true,
    });
  }
  await finalizeStory(interaction.client);
  return interaction.reply({ content: '✅ Round finalized early and a new one has started.' });
}

async function handleSetTopic(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need the Manage Server permission to do that.',
      ephemeral: true,
    });
  }
  const text = interaction.options.getString('text').trim();
  story.nextTopicOverride = text;
  await saveState();
  return interaction.reply({
    content: `✅ Got it — the next round's topic will be: "${text}"`,
    ephemeral: true,
  });
}

function buildStatusEmbed() {
  const wordCount = story.words.length;
  const msRemaining = Math.max(
    0,
    story.startedAt + CONFIG.STORY_DURATION_MS - Date.now()
  );
  const daysRemaining = (msRemaining / (24 * 60 * 60 * 1000)).toFixed(1);
  const lastUser = story.words.length
    ? story.words[story.words.length - 1].username
    : 'nobody yet';

  return new EmbedBuilder()
    .setTitle(`📖 Current Story — Topic: ${story.topic}`)
    .setDescription(
      wordCount
        ? story.words.map((w) => w.word).join(' ')
        : '*No words yet — be the first!*'
    )
    .addFields(
      { name: 'Words so far', value: `${wordCount}`, inline: true },
      { name: 'Last contributor', value: lastUser, inline: true },
      { name: 'Time left in round', value: `${daysRemaining} days`, inline: true }
    )
    .setColor(0x8a2be2);
}

// ============================================================================
// AUTO-FINALIZATION
// ============================================================================
async function finalizeStory(client) {
  const finishedStory = {
    topic: story.topic,
    words: story.words,
    startedAt: story.startedAt,
    finishedAt: Date.now(),
    fullText: story.words.map((w) => w.word).join(' '),
    contributors: [...new Set(story.words.map((w) => w.username))],
  };
  archive.push(finishedStory);
  await saveArchive();

  // Post the finished story
  try {
    const channel = await client.channels.fetch(CONFIG.STORY_CHANNEL_ID);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(`📚 Story complete: "${story.topic}"`)
        .setDescription(
          finishedStory.fullText || '*(No words were submitted this round.)*'
        )
        .addFields({
          name: 'Contributors',
          value: finishedStory.contributors.join(', ') || 'None',
        })
        .setColor(0x2ecc71)
        .setFooter({ text: `${finishedStory.words.length} words total` });
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Failed to post finished story:', err);
  }

  // Start the next round
  const nextTopicIndex = story.topicIndex + 1;
  const override = story.nextTopicOverride;
  story = startNewStoryObject(nextTopicIndex, override);
  await saveState();

  // Announce the new round's topic
  try {
    const channel = await client.channels.fetch(CONFIG.STORY_CHANNEL_ID);
    if (channel) {
      await channel.send(
        `✨ A new story round has begun! Topic: **${story.topic}**\nUse \`/story word\` to add the first word.`
      );
    }
  } catch (err) {
    console.error('Failed to announce new round:', err);
  }
}

async function checkExpiration(client) {
  if (!story) return;
  const expired = Date.now() - story.startedAt >= CONFIG.STORY_DURATION_MS;
  if (expired) {
    await finalizeStory(client);
  }
}

// ============================================================================
// INITIALIZATION — call this once when your bot is ready
// ============================================================================
async function initStoryGame(client) {
  await loadState();
  if (checkTimer) clearInterval(checkTimer); // avoid double timers on hot-reload
  checkTimer = setInterval(() => checkExpiration(client), CONFIG.CHECK_INTERVAL_MS);
  // Also check immediately in case the bot was down past the deadline
  await checkExpiration(client);
  console.log('[wordStory] Story game initialized.');
}

module.exports = {
  data,
  execute,
  initStoryGame,
};
