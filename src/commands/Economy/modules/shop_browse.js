// src/commands/Economy/modules/shop_browse.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        try {
            const ITEMS_PER_PAGE = 6;
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                const embed = new EmbedBuilder()
                    .setTitle('🛒 Server Shop')
                    .setColor(getColor('primary'))
                    .setDescription(
                        'Click a button below to instantly buy an item, or use the `/buy` command.\n' +
                        'For more details before purchasing, use the `/item info` command.'
                    )
                    .setFooter({ text: `Page ${page}/${totalPages} • Use /buy <item_id>` });

                pageItems.forEach(item => {
                    const priceFormatted = item.price.toLocaleString();
                    embed.addFields({
                        name: `${item.emoji || '🔹'} ${item.name} (${item.id})`,
                        value: `${item.description}\n` +
                               `**Price:** <a:coin:> **$${priceFormatted}**`,
                        inline: false,
                    });
                });

                return embed;
            };

            const createShopComponents = (page) => {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('shop_prev')
                        .setLabel('Previous Page')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId('shop_next')
                        .setLabel('Next Page')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );
                return [row];
            };

            const message = await interaction.reply({
                embeds: [createShopEmbed(currentPage)],
                components: createShopComponents(currentPage),
                flags: 0,
            });

            const collector = message.createMessageComponentCollector({
                componentType: 'BUTTON',
                time: 300000, // 5 minutes
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({ 
                        content: '❌ You cannot use these buttons. Run `/shop` for your own view.', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return;
                }

                await buttonInteraction.deferUpdate();

                if (buttonInteraction.customId === 'shop_prev') currentPage--;
                else if (buttonInteraction.customId === 'shop_next') currentPage++;

                await buttonInteraction.editReply({
                    embeds: [createShopEmbed(currentPage)],
                    components: createShopComponents(currentPage),
                });
            });

            collector.on('end', async () => {
                try {
                    const disabledRow = createShopComponents(currentPage)[0];
                    disabledRow.components.forEach(btn => btn.setDisabled(true));
                    await message.edit({ components: [disabledRow] });
                } catch (_) {}
            });

        } catch (error) {
            logger.error('shop_browse error:', error);
            await interaction.reply({ 
                content: '❌ An error occurred while loading the shop.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    },
};
