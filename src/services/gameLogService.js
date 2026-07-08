// gameLogService.js
//
// Tracks per-user results from Game Corner activities (gamble, slots,
// blackjack, coinflip, rob) so /mystats can show a daily win/loss summary.
// Entries older than 7 days are trimmed automatically on each write to
// keep storage bounded.

import { logger } from '../utils/logger.js';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function logKey(guildId, userId) {
    return `game-log:${guildId}:${userId}`;
}

/**
 * Records one game result. netAmount is positive for a win, negative for
 * a loss (the actual change to the player's wallet from that single play).
 */
export async function logGameResult(client, guildId, userId, gameType, netAmount) {
    try {
        const key = logKey(guildId, userId);
        const log = (await client.db.get(key)) || [];
        const cutoff = Date.now() - RETENTION_MS;

        const trimmed = log.filter((entry) => entry.timestamp > cutoff);
        trimmed.push({ gameType, amount: netAmount, timestamp: Date.now() });

        await client.db.set(key, trimmed);
    } catch (error) {
        // Never let logging break the actual game command
        logger.error(`Error logging game result for ${userId} in guild ${guildId}:`, error);
    }
}

/**
 * Returns today's (since local midnight) summary: net total, play count,
 * and a per-game breakdown.
 */
export async function getDailySummary(client, guildId, userId) {
    const key = logKey(guildId, userId);
    const log = (await client.db.get(key)) || [];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaysEntries = log.filter((entry) => entry.timestamp >= startOfDay.getTime());

    const byGame = {};
    let total = 0;

    for (const entry of todaysEntries) {
        byGame[entry.gameType] = (byGame[entry.gameType] || 0) + entry.amount;
        total += entry.amount;
    }

    return { byGame, total, count: todaysEntries.length };
}
