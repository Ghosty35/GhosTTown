// commands/shop/color.js

import { SlashCommandBuilder } from 'discord.js';
import { shopItems } from '../../data/items.js'; // ← confirm this path
import { setActiveColor, getOwnedItems } from '../../services/shopService.js';

const colorChoices = shopItems
    .filter((item) => item.type === 'color_role')
    .map((item) => ({ name: item.name, value: item.id }));

const data = new SlashCommandBuilder()
    .setName('color')
    .setDescription('Manage your name color')
    .addSubcommand((sub) =>
        sub
            .setName('set')
            .setDescription('Switch to a color you own')
            .addStringOption((opt) =>
                opt.setName('color').setDescription('Which color to use').setRequired(true).addChoices(...colorChoices)
            )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('See which colors you own'));

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const client = interaction.client;

    if (sub === 'set') {
        const itemId = interaction.options.getString('color');
        const result = await setActiveColor(client, interaction.guild, interaction.member, itemId);
        return interaction.reply({ content: result.message, ephemeral: !result.success });
    }

    if (sub === 'list') {
        const owned = await getOwnedItems(client, interaction.guildId, interaction.user.id);
        const ownedColors = owned.filter((line) =>
            shopItems.some((item) => item.type === 'color_role' && line.includes(item.name))
        );

        return interaction.reply({
            content: ownedColors.length
                ? `🎨 Colors you own:\n${ownedColors.join('\n')}\n\nUse \`/color set\` to switch.`
                : "You don't own any colors yet — check `/shop browse` to buy one!",
            ephemeral: true,
        });
    }
}

export default { data, execute };
