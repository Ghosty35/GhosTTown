// dashboardService.js
//
// Each member who runs /dashboard gets their own message posted in that
// channel — not an ephemeral reply, a real message the bot keeps editing
// in place. A cron job (see app.js) refreshes every registered dashboard
// on a timer, so members can just open the channel and see current data
// without running the command again.

import { EmbedBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';
import { getEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { getJobStatus } from './jobsService.js';
import { getDailySummary } from './gameLogService.js';
import { logger } from '../utils/logger.js';

function refKey(guildId, userId) {
    return `dashboard:${guildId}:${userId}`;
}

export async function getDashboardRef(client, guildId, userId) {
    return await client.db.get(refKey(guildId, userId));
}

export async function saveDashboardRef(client, guildId, userId, channelId, messageId) {
    await client.db.set(refKey(guildId, userId), { channelId, messageId, updatedAt: Date.now() });
}

export async function deleteDashboardRef(client, guildId, userId) {
    await client.db.delete(refKey(guildId, userId));
}

// [emoji, label, userData field, cooldown ms]
const COOLDOWN_ACTIONS = [
    ['🛠️', '/work', 'lastWork', 3 * 60 * 1000],
    ['🙏', '/beg', 'lastBeg', 3 * 60 * 1000],
    ['🎣', '/fish', 'lastFish', 3 * 60 * 1000],
    ['⛏️', '/mine', 'lastMine', 3 * 60 * 1000],
    ['🎁', '/daily', 'lastDaily', 24 * 60 * 60 * 1000],
    ['🎲', '/gamble', 'lastGamble', 3 * 60 * 1000],
    ['🎰', '/slots', 'lastSlots', 3 * 60 * 1000],
    ['🦹', '/rob', 'lastRob', 4 * 60 * 60 * 1000],
];

function formatRemaining(ms) {
    if (ms <= 0) return '✅ Ready';
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `⏳ ${hours}h ${minutes}m`;
    if (minutes > 0) return `⏳ ${minutes}m ${seconds}s`;
    return `⏳ ${seconds}s`;
}

export async function buildDashboardEmbed(client, guild, member) {
    const userData = await getEconomyData(client, guild.id, member.id);
    const now = Date.now();
    const maxBank = getMaxBankCapacity(userData);

    const jobStatus = await getJobStatus(client, guild, member);
    const gameSummary = await getDailySummary(client, guild.id, member.id);

    const isJailed = userData.jailedUntil && userData.jailedUntil > now;

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${member.user.username}'s Dashboard`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor(isJailed ? getColor('error') : getColor('economy'));

    // --- Jail banner (if applicable) ---
    if (isJailed) {
        embed.setDescription(`🚔 **In jail!** ${formatRemaining(userData.jailedUntil - now)}\n\nOthers can try \`/jailbreak\` — 50/50 odds.`);
    }

    // --- Money snapshot ---
    embed.addFields({
        name: '💰 Money',
        value:
            `👛 Cash: $${(userData.wallet || 0).toLocaleString()}\n` +
            `🏦 Bank: $${(userData.bank || 0).toLocaleString()} / $${maxBank.toLocaleString()}\n` +
            `💎 Net Worth: $${((userData.wallet || 0) + (userData.bank || 0)).toLocaleString()}`,
        inline: true,
    });

    // --- Job status ---
    embed.addFields({
        name: '💼 Job',
        value: jobStatus.employed
            ? `${jobStatus.job.emoji} ${jobStatus.job.name}\nNext pay: ${jobStatus.msUntilPay <= 0 ? 'Any moment' : formatRemaining(jobStatus.msUntilPay)}`
            : "Jobless\nCheck /job list",
        inline: true,
    });

    // --- Today's Game Corner net ---
    embed.addFields({
        name: '🎮 Today\'s Games',
        value: gameSummary.count === 0
            ? 'No plays yet today'
            : `${gameSummary.total >= 0 ? '📈 +' : '📉 '}$${gameSummary.total.toLocaleString()} (${gameSummary.count} play${gameSummary.count === 1 ? '' : 's'})`,
        inline: true,
    });

    // --- Cooldowns ---
    const crimeCooldownMs = 2 * 60 * 1000;
    const lastCrime = userData.cooldowns?.crime || 0;
    const crimeRemaining = lastCrime + crimeCooldownMs - now;

    const cooldownLines = [`🕵️ /crime: ${formatRemaining(crimeRemaining)}`];
    for (const [emoji, label, field, cooldownMs] of COOLDOWN_ACTIONS) {
        const last = userData[field] || 0;
        cooldownLines.push(`${emoji} ${label}: ${formatRemaining(last + cooldownMs - now)}`);
    }

    // Split into two columns for readability instead of one long list
    const half = Math.ceil(cooldownLines.length / 2);
    embed.addFields(
        { name: '⏱️ Cooldowns', value: cooldownLines.slice(0, half).join('\n'), inline: true },
        { name: '\u200b', value: cooldownLines.slice(half).join('\n'), inline: true }
    );

    embed.setFooter({ text: `Updates automatically • Last refreshed` }).setTimestamp();

    return embed;
}

/**
 * Called on a cron schedule (see app.js). Refreshes every registered
 * dashboard across every guild. If a message was deleted, cleans up the
 * stale reference instead of erroring on every future tick.
 */
export async function refreshAllDashboards(client) {
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const keys = await client.db.list(`dashboard:${guildId}:`);
            if (!keys || keys.length === 0) continue;

            for (const key of keys) {
                const userId = key.split(':').pop();
                const ref = await client.db.get(key);
                if (!ref) continue;

                try {
                    const channel = await guild.channels.fetch(ref.channelId).catch(() => null);
                    if (!channel) {
                        await client.db.delete(key);
                        continue;
                    }

                    const message = await channel.messages.fetch(ref.messageId).catch(() => null);
                    if (!message) {
                        await client.db.delete(key);
                        continue;
                    }

                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) {
                        await client.db.delete(key);
                        continue;
                    }

                    const embed = await buildDashboardEmbed(client, guild, member);
                    await message.edit({ embeds: [embed] });
                } catch (error) {
                    logger.error(`Error refreshing dashboard for ${userId} in guild ${guildId}:`, error);
                }
            }
        } catch (error) {
            logger.error(`Error refreshing dashboards for guild ${guildId}:`, error);
        }
    }
}
