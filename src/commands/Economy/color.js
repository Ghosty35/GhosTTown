import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const colorItems = shopItems.filter((i) => i.type === 'color_role');
const colorChoices = colorItems.map((i) => ({ name: i.name, value: i.id }));

export default {
    data: new SlashCommandBuilder()
        .setName('color')
        .setDescription('Manage your name color')
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Switch to a color you own')
                .addStringOption((opt) =>
                    opt
                        .setName('color')
                        .setDescription('Which color to use')
                        .setRequired(true)
                        .addChoices(...colorChoices)
                )
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('See which colors you own')),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (subcommand === 'list') {
            const userData = await getEconomyData(client, guildId, userId);
            const owned = colorItems.filter((i) => userData.inventory?.[i.id]);

            const embed = successEmbed(
                '🎨 Your Colors',
                owned.length
                    ? owned.map((i) => `${i.emoji || '•'} ${i.name}`).join('\n') + '\n\nUse `/color set` to switch.'
                    : "You don't own any colors yet — check `/shop` to see what's available!"
            );
            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        // subcommand === 'set'
        const itemId = interaction.options.getString('color');
        const item = colorItems.find((i) => i.id === itemId);

        if (!item) {
            throw createError('Invalid color item', ErrorTypes.VALIDATION, 'That is not a valid color.', { itemId });
        }

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData.inventory?.[itemId]) {
            throw createError(
                'Color not owned',
                ErrorTypes.VALIDATION,
                `You don't own **${item.name}** yet — buy it with \`/buy item_id:${itemId}\` first.`,
                { itemId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        const shopRoleMap = guildConfig.shopRoleMap || {};
        const newRoleId = shopRoleMap[itemId];

        if (!newRoleId) {
            throw createError(
                'Role not linked',
                ErrorTypes.CONFIGURATION,
                `An admin hasn't linked a Discord role to **${item.name}** yet.`,
                { itemId }
            );
        }

        const member = interaction.member;

        // Remove any other owned+linked color roles the member currently has
        const rolesToRemove = colorItems
            .map((i) => shopRoleMap[i.id])
            .filter(Boolean)
            .filter((roleId) => roleId !== newRoleId && member.roles.cache.has(roleId));

        for (const roleId of rolesToRemove) {
            await member.roles.remove(roleId).catch(() => {});
        }

        const role = interaction.guild.roles.cache.get(newRoleId);
        if (!role) {
            throw createError(
                'Role not found',
                ErrorTypes.CONFIGURATION,
                'The role linked to this color no longer exists in this server.',
                { roleId: newRoleId }
            );
        }

        await member.roles.add(role, `Switched to color: ${item.name}`);

        const embed = successEmbed('🎨 Color Updated', `Your name color is now **${item.name}**!`);
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'color' }),
};
