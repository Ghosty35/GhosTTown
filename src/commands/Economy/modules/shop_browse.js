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
            all: { label: 'All Items', icon: '🛒', blurb: 'Everything in stock, sorted by category.' },
            tool: { label: 'Tools & Gear', icon: '🛠️', blurb: 'Equipment that boosts your earnings and protects your cash.' },
            upgrade: { label: 'Upgrades', icon: '⚡', blurb: 'Permanent account improvements.' },
            role: { label: 'Premium', icon: '👑', blurb: 'Exclusive roles with lasting perks.' },
            consumable: { label: 'Consumables', icon: '🍀', blurb: 'One-time boosts for the bold.' },
            license: { label: 'Job Licenses', icon: '📜', blurb: 'Your ticket to a weekly paycheck — buy one, then /job apply.' },
            access_role: { label: 'VIP', icon: '⭐', blurb: 'Members-only access, forever.' },
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
                .setTitle(`🏪 GhostTown Marketplace  •  ${category.icon} ${category.label}`)
                .setColor(getColor('primary'))
                .setDescription(`*${category.blurb}*\n\n🛒 *Tap a* **Buy** *button for instant purchase — or use the menu to switch departments.*\n${DIVIDER}`);

            items.forEach((item, idx) => {
                embed.addFields({
                    name: `${item.emoji || '🔹'}  ${item.name}`,
                    value: `${item.description}\n💰 **\`$${item.price.toLocaleString()}\`**  ·  🏷️ \`${item.id}\``,
                    inline: false,
                });

                // Blank spacer + divider between items, but not after the last one
                if (idx < items.length - 1) {
                    embed.addFields({ name: '\u200b', value: DIVIDER, inline: false });
                }
            });

            embed.setFooter({ text: `📄 Page ${page}/${totalPages}  •  💳 Purchases charge your wallet  •  /buy <id> also works` });
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
                    .setPlaceholder('🏬 Browse departments...')
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
                        .setLabel(`Buy ${item.name} — $${item.price.toLocaleString()}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji(item.emoji || '🛒')
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
