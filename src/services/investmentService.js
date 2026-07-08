// investmentService.js
//
// Per-guild market prices for the /invest command. Prices live directly
// in client.db (same pattern as other simple per-guild state in this
// project) rather than in economy data, since they're shared across the
// whole server, not per-user.
//
// Regular assets do a bounded random walk each tick. Assets marked
// activityDriven (the Server Exchange, SRVX) instead track how many
// messages were sent in the guild since the last tick: busy server =
// price climbs, dead server = price bleeds.

import { investments } from '../config/investments.js';
import { logger } from '../utils/logger.js';

function marketKey(guildId) {
    return `investments:${guildId}`;
}

// ── Server activity tracking (for activity-driven assets) ──────────
//
// In-memory message counters per guild, reset every market tick.
// Kept in memory on purpose: writing to the db on every single message
// would hammer it on busy servers, and losing a partial window on a
// restart is harmless (the price just does one neutral-ish tick).
const activityCounters = new Map();

export function recordServerActivity(guildId) {
    activityCounters.set(guildId, (activityCounters.get(guildId) || 0) + 1);
}

// Messages-per-tick (15 min) → % price change for activity-driven assets.
// First matching tier wins. Tune these to your server's size: a small
// server might lower every threshold, a huge one might raise them.
const ACTIVITY_TIERS = [
    { minMessages: 200, change: +0.06 },  // buzzing → +6%
    { minMessages: 100, change: +0.04 },
    { minMessages: 50,  change: +0.025 },
    { minMessages: 20,  change: +0.01 },
    { minMessages: 5,   change: 0 },      // quiet but alive → flat
    { minMessages: 1,   change: -0.015 },
    { minMessages: 0,   change: -0.035 }, // dead silence → -3.5%
];

function getActivityChange(messageCount) {
    const tier = ACTIVITY_TIERS.find((t) => messageCount >= t.minMessages);
    // Small random jitter (±0.5%) so the chart isn't perfectly flat/stepped.
    const jitter = (Math.random() * 2 - 1) * 0.005;
    return (tier ? tier.change : 0) + jitter;
}
// ────────────────────────────────────────────────────────────────────

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

    // Backfill any assets added to investments.js after this guild's
    // market was first created (e.g. SRVX), so new symbols show up
    // without wiping existing prices.
    let changed = false;
    for (const asset of investments) {
        if (!market[asset.symbol]) {
            market[asset.symbol] = {
                price: asset.basePrice,
                prevPrice: asset.basePrice,
                updatedAt: Date.now(),
            };
            changed = true;
        }
    }
    if (changed) {
        await client.db.set(marketKey(guildId), market);
    }

    return market;
}

/**
 * Meant to be called on a cron schedule (see app.js setupCronJobs).
 * Randomly walks every regular asset's price for every guild, bounded
 * by each asset's volatility setting — and moves activity-driven assets
 * according to how many messages the guild sent since the last tick.
 */
export async function updateAllMarkets(client) {
    for (const [guildId] of client.guilds.cache) {
        try {
            const market = await getMarket(client, guildId);
            const messageCount = activityCounters.get(guildId) || 0;

            for (const asset of investments) {
                const entry = market[asset.symbol];
                if (!entry) continue;

                const change = asset.activityDriven
                    ? getActivityChange(messageCount)
                    : (Math.random() * 2 - 1) * asset.volatility;

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

    // Start a fresh activity window for the next tick.
    activityCounters.clear();
}

export function getPercentChange(entry) {
    if (!entry.prevPrice) return 0;
    return ((entry.price - entry.prevPrice) / entry.prevPrice) * 100;
}
