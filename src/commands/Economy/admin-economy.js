// commands/Economy/admin-economy.js
//
// Merges what used to be 2 separate top-level admin commands
// (/job-config and /atm-reset-pin) into one, to stay under Discord's
// 100-command-per-guild limit. Internal logic unchanged.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { setJobRoles } from '../../services/jobsService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('admin-economy')
        .setDescription('(Admin) Economy system configuration and member tools')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('job-roles')
                .setDescription('Set the Currently Working and Jobless roles')
                .addRoleOption((opt) => opt.setName('working').setDescription('Role for employed members').setRequired(true))
                .addRoleOption((opt) => opt.setName('jobless').setDescription('Role for unemployed members').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('reset-pin')
                .setDescription("Reset a member's forgotten ATM PIN")
                .addUserOption((opt) => opt.setName('member').setDescription('The member whose PIN needs resetting').setRequired(true))
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permissions', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to do that.');
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'job-roles') return executeJobRoles(interaction, client);
        if (subcommand === 'reset-pin') return executeResetPin(interaction, client);
    }, { command: 'admin-economy' })
};

async function executeJobRoles(interaction, client) {
    const working = interaction.options.getRole('working');
    const jobless = interaction.options.getRole('jobless');

    await setJobRoles(client, interaction.guildId, working.id, jobless.id);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'Job Roles Configured',
                `✅ Working role set to ${working.toString()}\n✅ Jobless role set to ${jobless.toString()}\n\nMake sure my role sits **above both** in Server Settings → Roles, or I won't be able to assign them.`
            ),
        ],
    });
}

async function executeResetPin(interaction, client) {
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

    try {
        await targetUser.send(`🔑 Your **Ghost Loans & Savings** ATM PIN was reset by a staff member. Run \`/atm\` in the server to set a new one.`);
    } catch (error) {
        // DMs closed or blocked — not worth surfacing to the admin.
    }
}
