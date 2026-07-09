import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song by name or link')
        .addStringOption((opt) =>
            opt
                .setName('query')
                .setDescription('Song name or link to play')
                .setRequired(true),
        ),

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
