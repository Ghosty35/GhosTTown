// commands/shop/shop.js

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { shopItems, getItemById } from '../../data/items.js'; // ← confirm this path
import { purchaseItem, setItemRole, getOwnedItems } from '../../services/shopService.js';
import { formatCurrency } from '../../utils/economy.js';

// Discord slash command choices max out at 25, so keep the catalog under
// that. Currently 17 items total (11 original + 6 new).
const buyChoices = shopItems.slice(0, 25).map((item) => ({
    name: `${item.name} — ${item.price.toLocaleString()}`,
    value: item.id,
}));

const roleLinkableChoices = shopItems
    .filter((item) => item.type === 'color_role' || item.type === 'access_role')
    .map((item) => ({ name: item.name, value: item.id }));

const data = new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and buy items to improve your stay on the server')
    .addSubcommand((sub) => sub.setName('browse').setDescription('See everything available in the shop'))
    .addSubcommand((sub) =>
        sub
            .setName('buy')
            .setDescription('Buy an item from the shop')
            .addStringOption((opt) =>
                opt.setName('item').setDescription('Which item to buy').setRequired(true).addChoices(...buyChoices)
            )
    )
    .addSubcommand((sub) => sub.setName('inventory').setDescription('See what you own'))
    .addSubcommand((sub) =>
        sub
            .setName('setrole')
            .setDescription('(Admin) Link a shop item to a Discord role')
            .addStringOption((opt) =>
                opt
                    .setName('item')
                    .setDescription('Which item to link')
                    .setRequired(true)
                    .addChoices(...roleLinkableChoices)
            )
            .addRoleOption((opt) => opt.setName('role').setDescription('The role to grant').setRequired(true))
    );

function formatItemLine(item) {
    const emoji = item.emoji || '•';
    return `${emoji} **${item.name}** — ${formatCurrency(item.price)}\n${item.description}`;
}

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const client = interaction.client;

    if (sub === 'browse') {
        const groups = {
            tool: '🛠️ Tools',
            consumable: '🎟️ Consumables',
            upgrade: '⬆️ Upgrades',
            role: '🎖️ Roles',
            color_role: '🎨 Name Colors',
            access_role: '⭐ Access',
        };

        const embed = new EmbedBuilder().setTitle('🛒 Server Shop').setColor(0xf1c40f);

        for (const [type, label] of Object.entries(groups)) {
            const items = shopItems.filter((i) => i.type === type);
            if (items.length === 0) continue;
            embed.addFields({
                name: label,
                value: items.map(formatItemLine).join('\n\n'),
            });
        }

        embed.setFooter({ text: 'Use /shop buy to purchase an item' });
        return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'buy') {
        const itemId = interaction.options.getString('item');
        const result = await purchaseItem(client, interaction.guild, interaction.member, itemId);
        return interaction.reply({ content: result.message, ephemeral: !result.success });
    }

    if (sub === 'inventory') {
        const owned = await getOwnedItems(client, interaction.guildId, interaction.user.id);
        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
            .setDescription(owned.length ? owned.join('\n') : "*You don't own anything yet — check `/shop browse`!*")
            .setColor(0x3498db);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'setrole') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: '❌ You need the Manage Roles permission to do that.',
                ephemeral: true,
            });
        }

        const itemId = interaction.options.getString('item');
        const role = interaction.options.getRole('role');
        const item = getItemById(itemId);

        await setItemRole(client, interaction.guildId, itemId, role.id);
        return interaction.reply({
            content: `✅ **${item.name}** is now linked to the ${role} role.\n\nReminder: make sure my role sits **above** ${role} in Server Settings → Roles, or I won't be able to assign it.`,
            ephemeral: true,
        });
    }
}

export default { data, execute };
