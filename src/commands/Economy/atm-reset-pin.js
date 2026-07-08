import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('atm-reset-pin')
        .setDescription('(Admin) Reset a member\'s forgotten ATM PIN')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption((option) =>
            option.setName('member').setDescription('The member whose PIN needs resetting').setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permissions', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to do that.');
        }

        const targetUser = interaction.options.getUser('member');
        const guildId = interaction.guildId;

        const userData = await getEconomyData(client, guildId, targetUser.id);

        if (!userData.atmPinHash) {
            await InteractionHelper.safeEditReply(interaction, {
                content: `ℹ️ **${targetUser.username}** hasn't set up an ATM PIN yet — there's nothing to reset.`,
            });
            return;
        }

        userData.atmPinHash = null;
        userData.atmFailedAttempts = 0;
        userData.atmLockoutUntil = 0;
        await setEconomyData(client, guildId, targetUser.id, userData);

        logger.info(`ATM PIN reset for ${targetUser.id} in guild ${guildId} by ${interaction.user.id}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    '🔑 PIN Reset',
                    `**${targetUser.username}**'s ATM PIN has been cleared. The next time they run \`/atm\`, they'll be prompted to set a brand new one.`
                ),
            ],
        });

        // Best-effort DM so they know without needing to be told manually.
        // Non-blocking: some members have DMs closed, that's fine.
        try {
            await targetUser.send(
                `🔑 Your **Ghost Loans & Savings** ATM PIN was reset by a staff member. Run \`/atm\` in the server to set a new one.`
            );
        } catch (error) {
            // DMs closed or blocked — not an error worth surfacing to the admin.
        }
    }, { command: 'atm-reset-pin' })
};
