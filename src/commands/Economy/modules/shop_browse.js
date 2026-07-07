import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { purchaseItem } from '../../services/shopService.js';

export default {
    async execute(interaction, config, client) {
        let currentCategory = 'all';
        let currentPage = 1;

        const categories = {
            all: 'All Items',
            tool: '🛠️ Tools',
            color_role: '🌈 Colors',
            consumable: '🍀 Consumables',
            access_role: '⭐ VIP',
            upgrade: '⬆️ Upgrades'
        };

        const getFilteredItems = () => {
            if (currentCategory === 'all') return shopItems;
            return shopItems.filter(item => item.type === currentCategory);
        };

        const createEmbed = (page) => {
            const filtered = getFilteredItems();
            const ITEMS_PER_PAGE = 4;
            const start = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);
            const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

            const embed = new EmbedBuilder()
                .setTitle(`🛒 ${categories[currentCategory]} — Server Shop`)
                .setColor(getColor('primary'))
                .setDescription('Click **Buy** below any item to purchase instantly.')
                .setFooter({ text: `Page ${page}/${totalPages || 1} • Use /item info for details` });

            pageItems.forEach(item => {
                embed.addFields({
                    name: `${item.emoji || '🔹'} ${item.name}`,
                    value: `**Price:** 🪙 $${item.price.toLocaleString()}\n${item.description}`,
                    inline: false
                });
            });

            return embed;
        };

        const createCategoryRow = () => {
            const options = Object.entries(categories).map(([value, label]) => ({
                label: label.replace(/[\uD83C\uDF00-\uD83D\uDE4F\uD83D\uDE80-\uD83D\uDEF4]/g, '').trim(),
                value: value,
                default: value === currentCategory
            }));

            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('shop_category')
                    .setPlaceholder('Select Category')
                    .addOptions(options)
            );
        };

        const createItemButtons = (page) => {
            const filtered = getFilteredItems();
            const ITEMS_PER_PAGE = 4;
            const start = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

            const row = new ActionRowBuilder();

            pageItems.forEach(item => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`buy_${item.id}`)
                        .setLabel('Buy')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🛒')
                );
            });

            // Navigation
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('shop_prev').setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('shop_next').setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= Math.ceil(filtered.length / 4))
            );

            return [row, navRow];
        };

        const msg = await interaction.reply({
            embeds: [createEmbed(currentPage)],
            components: [createCategoryRow(), ...createItemButtons(currentPage)]
        });

        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Not your shop.', flags: MessageFlags.Ephemeral });
            }

            await i.deferUpdate();

            if (i.customId === 'shop_category') {
                currentCategory = i.values[0];
                currentPage = 1;
            } else if (i.customId === 'shop_prev') currentPage--;
            else if (i.customId === 'shop_next') currentPage++;
            else if (i.customId.startsWith('buy_')) {
                const itemId = i.customId.replace('buy_', '');
                const result = await purchaseItem(client, interaction.guild, interaction.member, itemId);
                return i.followUp({ content: result.message, ephemeral: true });
            }

            await i.editReply({
                embeds: [createEmbed(currentPage)],
                components: [createCategoryRow(), ...createItemButtons(currentPage)]
            });
        });
    }
};
