import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    // Inside your play command execute function
const query = interaction.options.getString('song') || args.join(' ');

if (!query) {
    return interaction.reply({ content: 'Please provide a song name or link!', ephemeral: true });
}

// Auto YouTube search if it's not already a URL
let searchQuery = query;
if (!query.startsWith('http')) {
    searchQuery = `ytsearch:${query}`;   // This tells Lavalink to search YouTube
}

const result = await player.search(searchQuery, interaction.user);

,


    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            const result = await playQuery(client, interaction, interaction.options.getString('query'));
            await replyMusicSuccess(interaction, result.embed);
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'play' });
        }
    },
};
