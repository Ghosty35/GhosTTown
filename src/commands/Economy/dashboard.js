import { SlashCommandBuilder } from 'discord.js';
import { buildDashboardEmbed, getDashboardRef, saveDashboardRef, deleteDashboardRef } from '../../services/dashboardService.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Post your personal live stats dashboard in this channel'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;

        const guild = interaction.guild;
        const member = interaction.member;

        // If they already have one somewhere, clean it up first so we
        // don't leave a stale, no-longer-updating card behind.
        const existingRef = await getDashboardRef(client, guild.id, member.id);
        if (existingRef) {
            try {
                const oldChannel = await guild.channels.fetch(existingRef.channelId).catch(() => null);
                if (oldChannel) {
                    const oldMessage = await oldChannel.messages.fetch(existingRef.messageId).catch(() => null);
                    if (oldMessage) await oldMessage.delete().catch(() => {});
                }
            } catch (error) {
                logger.error(`Error cleaning up old dashboard for ${member.id}:`, error);
            }
            await deleteDashboardRef(client, guild.id, member.id);
        }

        const embed = await buildDashboardEmbed(client, guild, member);
        const message = await interaction.channel.send({ embeds: [embed] });

        await saveDashboardRef(client, guild.id, member.id, interaction.channel.id, message.id);

        await InteractionHelper.safeEditReply(interaction, {
            content: '✅ Your dashboard is live in this channel! It updates automatically — no need to run this again.',
        });
    }, { command: 'dashboard' })
};
