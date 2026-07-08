// investmentService.js
//
// Per-guild market prices for the /invest command. Prices live directly
// in client.db (same pattern as other simple per-guild state in this
// project) rather than in economy data, since they're shared across the
// whole server, not per-user.

import { investments } from '../config/investments.js';
import { logger } from '../utils/logger.js';

function marketKey(guildId) {
    return `investments:${guildId}`;
}

function freshMarket() {
    const market = {};
    for (const asset of investments) {
        market[asset.symbol] = {
            price: asset.basePrice,
            prevPrice: asset.basePrice,
            updatedAt: Date.now(),
        };
    }
    return market;
}

export async function getMarket(client, guildId) {
    let market = await client.db.get(marketKey(guildId), null);
    if (!market) {
        market = freshMarket();
        await client.db.set(marketKey(guildId), market);
    }
    return market;
}

/**
 * Meant to be called on a cron schedule (see app.js setupCronJobs).
 * Randomly walks every asset's price for every guild, bounded by each
 * asset's volatility setting. Mirrors the checkBirthdays/checkGiveaways
 * "loop every guild" pattern already used elsewhere in this bot.
 */
export async function updateAllMarkets(client) {
    for (const [guildId] of client.guilds.cache) {
        try {
            const market = await getMarket(client, guildId);

            for (const asset of investments) {
                const entry = market[asset.symbol];
                if (!entry) continue;

                const change = (Math.random() * 2 - 1) * asset.volatility;
                const newPrice = Math.max(1, Math.round(entry.price * (1 + change)));

                entry.prevPrice = entry.price;
                entry.price = newPrice;
                entry.updatedAt = Date.now();
            }

            await client.db.set(marketKey(guildId), market);
        } catch (error) {
            logger.error(`Error updating investment market for guild ${guildId}:`, error);
        }
    }
}

export function getPercentChange(entry) {
    if (!entry.prevPrice) return 0;
    return ((entry.price - entry.prevPrice) / entry.prevPrice) * 100;
}
