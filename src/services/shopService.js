// shopService.js
//
// Handles buying shop items, tracking ownership, and granting/switching
// Discord roles for color and access items. Built on top of your existing
// utils/economy.js (balance) and items.js (catalog + validation).
//
// ⚠️ IMPORT PATH: economy.js's own imports show it lives in `utils/`, so
// that import below should be correct. items.js's location wasn't
// confirmed — adjust the path below to wherever you place the updated
// items.js file (e.g. '../data/items.js', '../utils/items.js', etc).

import { getEconomyData, setEconomyData, removeMoney, formatCurrency } from '../utils/economy.js';
import { getItemById, validatePurchase, shopItems } from '../data/items.js'; // ← confirm this path
import { logger } from '../utils/logger.js';

// -----------------------------------------------------------------------
// PER-GUILD ROLE CONFIG
// Maps a shop item id -> the actual Discord role id an admin created for
// it. Discord role IDs are different in every server, so this has to be
// configured per guild rather than hardcoded in the catalog.
// -----------------------------------------------------------------------
function configKey(guildId) {
    return `shop-roles:${guildId}`;
}

export async function getShopRoleConfig(client, guildId) {
    const config = await client.db.get(configKey(guildId));
    return config || { roleMap: {} };
}

export async function setItemRole(client, guildId, itemId, roleId) {
    const config = await getShopRoleConfig(client, guildId);
    config.roleMap[itemId] = roleId;
    await client.db.set(configKey(guildId), config);
    return config;
}

// -----------------------------------------------------------------------
// PURCHASING
// Works for every item type in your catalog (consumable, upgrade, tool,
// role, and the new color_role / access_role types) using items.js's own
// validatePurchase as the source of truth for eligibility.
// -----------------------------------------------------------------------
export async function purchaseItem(client, guild, member, itemId) {
    const item = getItemById(itemId);
    if (!item) {
        return { success: false, message: 'That item does not exist.' };
    }

    const guildId = guild.id;
    const userId = member.id;
    const userData = await getEconomyData(client, guildId, userId);

    const check = validatePurchase(itemId, userData);
    if (!check.valid) {
        return { success: false, message: check.reason };
    }

    if ((userData.wallet || 0) < item.price) {
        return {
            success: false,
            message: `You need ${formatCurrency(item.price)} but only have ${formatCurrency(userData.wallet || 0)}.`,
        };
    }

    const removal = await removeMoney(client, guildId, userId, item.price, 'wallet');
    if (!removal.success) {
        return { success: false, message: removal.error || 'Purchase failed. Please try again.' };
    }

    // Re-fetch so we're updating the freshest copy after payment
    const updated = await getEconomyData(client, guildId, userId);
    updated.inventory = updated.inventory || {};
    updated.upgrades = updated.upgrades || {};

    if (item.type === 'consumable' || item.type === 'tool') {
        updated.inventory[itemId] = (updated.inventory[itemId] || 0) + 1;
    } else if (item.type === 'upgrade') {
        updated.upgrades[itemId] = true;
    } else if (item.type === 'color_role' || item.type === 'access_role') {
        updated.inventory[itemId] = true;
    }

    await setEconomyData(client, guildId, userId, updated);

    let roleNote = '';
    if (item.type === 'color_role' || item.type === 'access_role') {
        const config = await getShopRoleConfig(client, guildId);
        const roleId = config.roleMap[itemId];

        if (roleId) {
            try {
                await member.roles.add(roleId, `Purchased ${item.name}`);
            } catch (error) {
                logger.error(`Failed to grant role for item ${itemId} to user ${userId}:`, error);
                roleNote =
                    "\n⚠️ I couldn't assign the Discord role — ask an admin to check that my role sits above it in the role list, and that I have Manage Roles permission.";
            }
        } else {
            roleNote =
                "\n⚠️ An admin hasn't linked a Discord role to this item yet (`/shop setrole`), so nothing visually changed. Your purchase is saved though — the role will apply once it's linked.";
        }
    }

    return {
        success: true,
        message: `✅ Purchased **${item.name}** for ${formatCurrency(item.price)}!${roleNote}`,
    };
}

// -----------------------------------------------------------------------
// COLOR SWITCHING
// Lets someone switch between any color roles they already own, without
// paying again. Removes any other owned+configured color role they
// currently have, then adds the requested one.
// -----------------------------------------------------------------------
export async function setActiveColor(client, guild, member, itemId) {
    const item = getItemById(itemId);
    if (!item || item.type !== 'color_role') {
        return { success: false, message: 'That is not a color item.' };
    }

    const userData = await getEconomyData(client, guild.id, member.id);
    if (!userData.inventory?.[itemId]) {
        return { success: false, message: `You don't own **${item.name}** yet — buy it with \`/shop buy\` first.` };
    }

    const config = await getShopRoleConfig(client, guild.id);
    const newRoleId = config.roleMap[itemId];
    if (!newRoleId) {
        return {
            success: false,
            message: `An admin hasn't linked a Discord role to **${item.name}** yet — ask them to run \`/shop setrole\`.`,
        };
    }

    const allColorItemIds = shopItems.filter((i) => i.type === 'color_role').map((i) => i.id);
    const rolesToRemove = allColorItemIds
        .map((id) => config.roleMap[id])
        .filter(Boolean)
        .filter((roleId) => roleId !== newRoleId && member.roles.cache.has(roleId));

    for (const roleId of rolesToRemove) {
        await member.roles.remove(roleId).catch((error) => {
            logger.error(`Failed to remove old color role ${roleId} from ${member.id}:`, error);
        });
    }

    try {
        await member.roles.add(newRoleId);
    } catch (error) {
        logger.error(`Failed to add color role ${newRoleId} to ${member.id}:`, error);
        return {
            success: false,
            message: "❌ I couldn't assign that role — ask an admin to check my role position and permissions.",
        };
    }

    return { success: true, message: `✅ Your name color is now **${item.name}**!` };
}

// -----------------------------------------------------------------------
// INVENTORY DISPLAY
// -----------------------------------------------------------------------
export async function getOwnedItems(client, guildId, userId) {
    const userData = await getEconomyData(client, guildId, userId);
    const owned = [];

    for (const item of shopItems) {
        if (item.type === 'consumable' || item.type === 'tool') {
            const qty = userData.inventory?.[item.id] || 0;
            if (qty > 0) owned.push(`${item.emoji || '•'} ${item.name} x${qty}`);
        } else if (item.type === 'upgrade') {
            if (userData.upgrades?.[item.id]) owned.push(`${item.emoji || '•'} ${item.name}`);
        } else if (item.type === 'color_role' || item.type === 'access_role') {
            if (userData.inventory?.[item.id]) owned.push(`${item.emoji || '•'} ${item.name}`);
        }
    }

    return owned;
}
