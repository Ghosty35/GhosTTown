// /home/workdir/GhosTTown-main/src/commands/Economy/modules/shop_browse.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { purchaseItem } from '../../../services/shopService.js';

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

        const getFilteredItems = () => currentCategory === 'all' 
            ? shopItems 
            : shopItems.filter(i => i.type === currentCategory);

        const createEmbed = (page) => {
            const filtered = getFilteredItems();
            const perPage = 4;
            const start = (page - 1) * perPage;
            const items = filtered.slice(start, start + perPage);

            const embed = new EmbedBuilder()
                .setTitle(`🛒 ${categories[currentCategory]} — Shop`)
                .setColor(getColor('primary'))
                .setDescription('**Click "Buy"** to purchase instantly.')
                .setFooter({ text: `Page ${page} • /buy <id> for manual purchase` });

            items.forEach(item => {
                embed.addFields({
                    name: `${item.emoji || '🔹'} ${item.name} (${item.id})`,
                    value: `${item.description}\n**Price:** 🪙 **$${item.price.toLocaleString()}**`,
                    inline: false
                });
            });

            return embed;
        };

        const categoryRow = () => {
            const opts = Object.entries(categories).map(([val, label]) => ({
                label: label.replace(/[^a-zA-Z0-9 ]/g, '').trim(),
                value: val,
                default: val === currentCategory
            }));

            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('shop_category')
                    .setPlaceholder('Choose Category')
                    .addOptions(opts)
            );
        };

        const actionRow = (page) => {
            const filtered = getFilteredItems();
            const perPage = 4;
            const start = (page - 1) * perPage;
            const items = filtered.slice(start, start + perPage);

            const buyRow = new ActionRowBuilder();
            items.forEach(item => {
                buyRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`buy_${item.id}`)
                        .setLabel('Buy')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🛒')
                );
            });

            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('next').setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page * 4 >= filtered.length)
            );

            return [buyRow, navRow];
        };

        const msg = await interaction.reply({
            embeds: [createEmbed(currentPage)],
            components: [categoryRow(), ...actionRow(currentPage)]
        });

        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Not your shop.', flags: MessageFlags.Ephemeral });

            await i.deferUpdate();

            if (i.customId === 'shop_category') {
                currentCategory = i.values[0];
                currentPage = 1;
            } else if (i.customId === 'prev') currentPage--;
            else if (i.customId === 'next') currentPage++;
            else if (i.customId.startsWith('buy_')) {
                const itemId = i.customId.slice(4);
                const result = await purchaseItem(client, interaction.guild, i.member, itemId);
                return i.followUp({ content: result.message, ephemeral: true });
            }

            await i.editReply({
                embeds: [createEmbed(currentPage)],
                components: [categoryRow(), ...actionRow(currentPage)]
            });
        });
    }
};
