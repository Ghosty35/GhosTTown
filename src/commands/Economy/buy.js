import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { purchaseItem } from '../../services/shopService.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Quantity to buy (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const itemId = interaction.options.getString("item_id").toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) {
            throw createError(
                `Item ${itemId} not found`,
                ErrorTypes.VALIDATION,
                `The item ID \`${itemId}\` does not exist in the shop.`,
                { itemId }
            );
        }

        const result = await purchaseItem(client, interaction.guild, interaction.member, itemId, quantity);

        if (!result.success) {
            throw createError(
                'Purchase failed',
                ErrorTypes.VALIDATION,
                result.message,
                { itemId, quantity }
            );
        }

        const embed = successEmbed("💰 Purchase Successful", result.message);
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};
