import { PermissionsBitField } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { getItemById } from '../../../config/shop/items.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                content: '❌ You need **Manage Server** permissions to link shop items to roles.',
                ephemeral: true,
            });
        }

        const itemId = interaction.options.getString('item');
        const role = interaction.options.getRole('role');
        const item = getItemById(itemId);

        if (!item) {
            return InteractionHelper.safeReply(interaction, {
                content: `❌ Item \`${itemId}\` not found.`,
                ephemeral: true,
            });
        }

        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.shopRoleMap = currentConfig.shopRoleMap || {};
            currentConfig.shopRoleMap[itemId] = role.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        'Item Role Linked',
                        `**${item.name}** is now linked to ${role.toString()}. Members who buy this item will be granted this role.\n\nMake sure my role sits **above** ${role.toString()} in Server Settings → Roles, or I won't be able to assign it.`
                    ),
                ],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_linkrole error:', error);
            return InteractionHelper.safeReply(interaction, {
                content: '❌ Could not save the guild configuration.',
                ephemeral: true,
            });
        }
    },
};
