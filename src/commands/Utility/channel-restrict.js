import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getChannelRestrictions, setGroupChannel, COMMAND_GROUPS, GROUP_LABELS } from '../../services/channelRestrictionService.js';
import { getStoryConfig, setStoryChannel } from '../../services/storyService.js';
import { successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const groupChoices = [
    { name: 'Banking', value: 'banking' },
    { name: 'Work', value: 'work' },
    { name: 'Game Corner', value: 'gamecorner' },
    { name: 'Word Story', value: 'story' },
];

export default {
    data: new SlashCommandBuilder()
        .setName('channel-restrict')
        .setDescription('(Admin) Restrict command groups to specific channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Restrict a command group to one channel')
                .addStringOption((opt) => opt.setName('group').setDescription('Which group').setRequired(true).addChoices(...groupChoices))
                .addChannelOption((opt) => opt.setName('channel').setDescription('The channel to restrict it to').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('See current channel restrictions')),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permissions', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to do that.');
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const group = interaction.options.getString('group');
            const channel = interaction.options.getChannel('channel');

            if (group === 'story') {
                await setStoryChannel(client, interaction.guildId, channel.id);
            } else {
                await setGroupChannel(client, interaction.guildId, group, channel.id);
            }

            const commandList = group === 'story' ? '/story and plain-text word entries' : COMMAND_GROUPS[group].map((c) => `/${c}`).join(', ');

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        'Channel Restriction Set',
                        `**${GROUP_LABELS[group]}** commands (${commandList}) are now restricted to ${channel.toString()}.`
                    ),
                ],
            });
            return;
        }

        if (subcommand === 'list') {
            const restrictions = await getChannelRestrictions(client, interaction.guildId);
            const storyConfig = await getStoryConfig(client, interaction.guildId);

            const embed = new EmbedBuilder().setTitle('🔒 Channel Restrictions').setColor(getColor('economy'));

            for (const group of ['banking', 'work', 'gamecorner']) {
                const channelId = restrictions[group];
                embed.addFields({
                    name: GROUP_LABELS[group],
                    value: channelId ? `<#${channelId}>\n${COMMAND_GROUPS[group].map((c) => `/${c}`).join(', ')}` : 'Not restricted — usable anywhere',
                    inline: false,
                });
            }

            embed.addFields({
                name: GROUP_LABELS.story,
                value: storyConfig.channelId ? `<#${storyConfig.channelId}>\n/story and plain-text word entries` : 'Not restricted — usable anywhere',
                inline: false,
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'channel-restrict' })
};
