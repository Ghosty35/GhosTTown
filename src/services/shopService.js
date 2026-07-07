// shopService.js
//
// Centralized shop purchase logic. Both /buy and the shop browser's
// "Buy" buttons call this same function, so purchase rules only live
// in one place instead of being duplicated (and drifting out of sync).

import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { getGuildConfig } from './guildConfig.js';
import { getItemById } from '../config/shop/items.js';
import { logger } from '../utils/logger.js';

/**
 * Attempts to purchase an item for a member.
 * Returns { success: boolean, message: string }
 */
export async function purchaseItem(client, guild, member, itemId, quantity = 1) {
    const item = getItemById(itemId);
    if (!item) {
        return { success: false, message: `❌ Item \`${itemId}\` not found.` };
    }

    if (quantity < 1) {
        return { success: false, message: '❌ You must purchase a quantity of 1 or more.' };
    }

    const guildId = guild.id;
    const userId = member.id;
    const totalCost = item.price * quantity;

    const guildConfig = await getGuildConfig(client, guildId);
    const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;
    const shopRoleMap = guildConfig.shopRoleMap || {};

    const userData = await getEconomyData(client, guildId, userId);

    if (userData.wallet < totalCost) {
        return {
            success: false,
            message: `❌ You need **$${totalCost.toLocaleString()}** for ${quantity}x **${item.name}**, but you only have **$${userData.wallet.toLocaleString()}**.`,
        };
    }

    // --- Pre-purchase validation ---
    if (item.type === 'role' && itemId === 'premium_role') {
        if (!PREMIUM_ROLE_ID) {
            return { success: false, message: 'The **Premium Shop Role** has not been configured by a server admin yet.' };
        }
        if (member.roles.cache.has(PREMIUM_ROLE_ID)) {
            return { success: false, message: `You already have the **${item.name}** role.` };
        }
        if (quantity > 1) {
            return { success: false, message: `You can only purchase **${item.name}** once.` };
        }
    }

    if (item.type === 'color_role' || item.type === 'access_role') {
        if (userData.inventory?.[itemId]) {
            return { success: false, message: `You already own **${item.name}**.` };
        }
        if (!shopRoleMap[itemId]) {
            return {
                success: false,
                message: `**${item.name}** hasn't been linked to a Discord role yet. Ask an admin to run \`/shop-config linkrole\`.`,
            };
        }
        if (quantity > 1) {
            return { success: false, message: `You can only purchase **${item.name}** once.` };
        }
    }

    // --- Grant roles FIRST (before charging), so a failed role assignment
    //     never costs the member money ---
    if (item.type === 'role' && itemId === 'premium_role') {
        const role = guild.roles.cache.get(PREMIUM_ROLE_ID);
        if (!role) {
            return { success: false, message: 'The configured premium role no longer exists in this server.' };
        }
        try {
            await member.roles.add(role, `Purchased role: ${item.name}`);
        } catch (error) {
            logger.error(`Failed to grant premium role to ${userId}:`, error);
            return { success: false, message: "I couldn't assign the role — ask an admin to check my permissions and role position. You haven't been charged." };
        }
    } else if (item.type === 'color_role' || item.type === 'access_role') {
        const roleId = shopRoleMap[itemId];
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return { success: false, message: 'The role linked to this item no longer exists in this server.' };
        }
        try {
            await member.roles.add(role, `Purchased item: ${item.name}`);
        } catch (error) {
            logger.error(`Failed to grant item role for ${itemId} to ${userId}:`, error);
            return { success: false, message: "I couldn't assign the role — ask an admin to check my permissions and role position. You haven't been charged." };
        }
    }

    // --- Charge and update inventory/upgrades ---
    userData.wallet -= totalCost;
    let successMessage = `✅ Purchased ${quantity}x **${item.name}** for **$${totalCost.toLocaleString()}**!`;

    if (item.type === 'role' && itemId === 'premium_role') {
        const role = guild.roles.cache.get(PREMIUM_ROLE_ID);
        successMessage += `\n\n👑 The role ${role.toString()} has been granted!`;
    } else if (item.type === 'upgrade') {
        userData.upgrades[itemId] = true;
        successMessage += `\n\n✨ Your upgrade is now active!`;
    } else if (item.type === 'consumable') {
        userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
    } else if (item.type === 'color_role' || item.type === 'access_role') {
        const role = guild.roles.cache.get(shopRoleMap[itemId]);
        userData.inventory[itemId] = (userData.inventory[itemId] || 0) + 1;
        successMessage += item.type === 'color_role'
            ? `\n\n🎨 The ${role.toString()} color role has been granted! Use \`/color set\` to switch between colors you own.`
            : `\n\n⭐ You now have access to ${role.toString()}!`;
    }

    await setEconomyData(client, guildId, userId, userData);
    return { success: true, message: successMessage };
}
