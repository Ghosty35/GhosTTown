import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { purchaseItem } from '../../../services/shopService.js';

const DIVIDER = '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯';

export default {
    async execute(interaction, config, client) {
        let currentCategory = 'all';
        let currentPage = 1;
        const perPage = 3; // fewer per page = more breathing room per item

        const categories = {
            all: { label: 'All Items', icon: '🛒' },
            tool: { label: 'Tools', icon: '🛠️' },
            color_role: { label: 'Colors', icon: '🌈' },
            consumable: { label: 'Consumables', icon: '🍀' },
            access_role: { label: 'VIP', icon: '⭐' },
            upgrade: { label: 'Upgrades', icon: '⬆️' },
        };

        const getFilteredItems = () =>
            currentCategory === 'all' ? shopItems : shopItems.filter((i) => i.type === currentCategory);

        const createEmbed = (page) => {
            const filtered = getFilteredItems();
            const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
            const start = (page - 1) * perPage;
            const items = filtered.slice(start, start + perPage);
            const category = categories[currentCategory];

            const embed = new EmbedBuilder()
                .setTitle(`${category.icon}  ${category.label} — Shop`)
                .setColor(getColor('primary'))
                .setDescription(`🛍️ *Click a* **Buy** *button below to purchase instantly.*\n${DIVIDER}`);

            items.forEach((item, idx) => {
                embed.addFields({
                    name: `${item.emoji || '🔹'}  ${item.name}  •  \`${item.id}\``,
                    value: `${item.description}\n\n**💰 Price:** \`$${item.price.toLocaleString()}\``,
                    inline: false,
                });

                // Blank spacer + divider between items, but not after the last one
                if (idx < items.length - 1) {
                    embed.addFields({ name: '\u200b', value: DIVIDER, inline: false });
                }
            });

            embed.setFooter({ text: `📄 Page ${page} of ${totalPages}   •   /buy <id> for manual purchase` });
            return embed;
        };

        const categoryRow = () => {
            const opts = Object.entries(categories).map(([val, { label }]) => ({
                label,
                value: val,
                default: val === currentCategory,
            }));

            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('shop_category')
                    .setPlaceholder('📂 Choose a category')
                    .addOptions(opts)
            );
        };

        const actionRow = (page) => {
            const filtered = getFilteredItems();
            const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
            const start = (page - 1) * perPage;
            const items = filtered.slice(start, start + perPage);

            const buyRow = new ActionRowBuilder();
            items.forEach((item) => {
                buyRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`buy_${item.id}`)
                        .setLabel(`Buy ${item.name}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🛒')
                );
            });

            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('next').setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
            );

            return [buyRow, navRow];
        };

        const msg = await interaction.reply({
            embeds: [createEmbed(currentPage)],
            components: [categoryRow(), ...actionRow(currentPage)],
        });

        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Not your shop.', flags: MessageFlags.Ephemeral });
            }

            await i.deferUpdate();

            if (i.customId === 'shop_category') {
                currentCategory = i.values[0];
                currentPage = 1;
            } else if (i.customId === 'prev') {
                currentPage--;
            } else if (i.customId === 'next') {
                currentPage++;
            } else if (i.customId.startsWith('buy_')) {
                const itemId = i.customId.slice(4);
                const result = await purchaseItem(client, interaction.guild, i.member, itemId);
                return i.followUp({ content: result.message, ephemeral: true });
            }

            await i.editReply({
                embeds: [createEmbed(currentPage)],
                components: [categoryRow(), ...actionRow(currentPage)],
            });
        });
    },
};
