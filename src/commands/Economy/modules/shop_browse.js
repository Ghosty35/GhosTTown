import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        try {
            const ITEMS_PER_PAGE = 5; // Nice number for clean pages
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page) => {
                const start = (page - 1) * ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(start, start + ITEMS_PER_PAGE);

                const embed = new EmbedBuilder()
                    .setTitle('🛒 Server Shop')
                    .setColor(getColor('primary'))
                    .setDescription(
                        '**Click a button below to instantly buy an item**, or use the `/buy` command.\n' +
                        'For details before buying, use `/item info <id>`.'
                    )
                    .setFooter({ text: `Page ${page}/${totalPages} • Economy Shop` });

                pageItems.forEach(item => {
                    const price = item.price.toLocaleString();
                    embed.addFields({
                        name: `${item.emoji || '🔹'} ${item.name} (${item.id})`,
                        value: `${item.description}\n**Price:** 🪙 **$${price}**`,
                        inline: false
                    });
                });

                return embed;
            };

            const createButtons = (page) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('shop_prev')
                        .setLabel('⬅️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId('shop_next')
                        .setLabel('Next ➡️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );
            };

            const reply = await interaction.reply({
                embeds: [createShopEmbed(currentPage)],
                components: [createButtons(currentPage)],
            });

            const collector = reply.createMessageComponentCollector({
                componentType: 'BUTTON',
                time: 300_000, // 5 minutes
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ This shop belongs to someone else.', flags: MessageFlags.Ephemeral });
                }

                await i.deferUpdate();

                if (i.customId === 'shop_prev') currentPage = Math.max(1, currentPage - 1);
                if (i.customId === 'shop_next') currentPage = Math.min(totalPages, currentPage + 1);

                await i.editReply({
                    embeds: [createShopEmbed(currentPage)],
                    components: [createButtons(currentPage)],
                });
            });

            collector.on('end', async () => {
                try {
                    const disabled = createButtons(currentPage);
                    disabled.components.forEach(b => b.setDisabled(true));
                    await reply.edit({ components: [disabled] });
                } catch (_) {}
            });

        } catch (error) {
            logger.error('Shop browse error:', error);
            await interaction.reply({ 
                content: '❌ Failed to load the shop.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
