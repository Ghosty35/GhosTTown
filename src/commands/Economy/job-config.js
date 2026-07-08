import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { setJobRoles } from '../../services/jobsService.js';
import { successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('job-config')
        .setDescription('(Admin) Configure the job system roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('setroles')
                .setDescription('Set the Currently Working and Jobless roles')
                .addRoleOption((opt) => opt.setName('working').setDescription('Role for employed members').setRequired(true))
                .addRoleOption((opt) => opt.setName('jobless').setDescription('Role for unemployed members').setRequired(true))
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permissions', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to do that.');
        }

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
    }, { command: 'job-config' })
};
