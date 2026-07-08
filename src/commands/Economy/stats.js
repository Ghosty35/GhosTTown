// commands/Economy/stats.js
//
// Merges what used to be 4 separate top-level commands (/earnings,
// /cooldowns, /mystats, /dashboard) into one command with subcommands,
// to stay under Discord's 100-command-per-guild limit. Internal logic
// for each is unchanged — only the command structure changed.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { jobs } from '../../config/jobs.js';
import { getEconomyData } from '../../utils/economy.js';
import { getDailySummary } from '../../services/gameLogService.js';
import { buildDashboardEmbed, getDashboardRef, saveDashboardRef, deleteDashboardRef } from '../../services/dashboardService.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Earnings breakdown, cooldowns, game results, and your live dashboard')
        .addSubcommand((sub) => sub.setName('earnings').setDescription('See a full breakdown of every way to earn GhostCoins'))
        .addSubcommand((sub) => sub.setName('cooldowns').setDescription('See your current cooldowns for every economy command'))
        .addSubcommand((sub) => sub.setName('games').setDescription("See today's win/loss summary from Game Corner activities"))
        .addSubcommand((sub) => sub.setName('dashboard').setDescription('Post your personal live stats dashboard in this channel')),

    execute: withErrorHandling(async (interaction, config, client) => {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'earnings') return executeEarnings(interaction);
        if (subcommand === 'cooldowns') return executeCooldowns(interaction, client);
        if (subcommand === 'games') return executeGames(interaction, client);
        if (subcommand === 'dashboard') return executeDashboard(interaction, client);
    }, { command: 'stats' })
};

// =====================================================================
// EARNINGS
// =====================================================================
const STEADY_INCOME = [
    ['/work', 750, 4000, 180],
    ['/beg', 100, 1000, 180],
    ['/fish', 500, 2000, 180],
    ['/mine', 600, 2200, 180],
];

const CRIME_TIERS = [
    ['Pickpocketing', 250, 2000, 0.3],
    ['Burglary', 500, 3500, 0.4],
    ['Bank Heist', 1750, 7500, 0.6],
    ['Art Theft', 3500, 14000, 0.7],
    ['Cybercrime', 8000, 28000, 0.8],
];

function pad(str, len) {
    return String(str).padEnd(len, ' ');
}

function money(n) {
    return `$${Math.round(n).toLocaleString()}`;
}

async function executeEarnings(interaction) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    let jobsTable = pad('Job', 16) + pad('Hour', 10) + pad('Day', 12) + 'Week\n';
    jobsTable += '-'.repeat(50) + '\n';

    for (const job of jobs) {
        const avgWeekly = (job.weeklyPay.min + job.weeklyPay.max) / 2;
        const avgDaily = avgWeekly / 7;
        const avgHourly = avgDaily / 24;

        jobsTable += pad(job.name, 16) + pad(money(avgHourly), 10) + pad(money(avgDaily), 12) + `${money(job.weeklyPay.min)}-${money(job.weeklyPay.max)}\n`;
    }

    const jobsEmbed = new EmbedBuilder()
        .setTitle('💼 Job Earnings')
        .setDescription('Average rate if you held the job passively — you get paid automatically every 7 days regardless.\n\n' + '```\n' + jobsTable + '```')
        .setColor(getColor('economy'))
        .setFooter({ text: 'Requires the matching license from /shop — see /job list' });

    let steadyTable = pad('Command', 10) + pad('Range', 16) + pad('Cooldown', 10) + 'Potential/hr\n';
    steadyTable += '-'.repeat(52) + '\n';

    for (const [label, min, max, cooldownSec] of STEADY_INCOME) {
        const avg = (min + max) / 2;
        const usesPerHour = 3600 / cooldownSec;
        const potential = avg * usesPerHour;

        steadyTable += pad(label, 10) + pad(`${money(min)}-${money(max)}`, 16) + pad(`${cooldownSec / 60}m`, 10) + money(potential) + '\n';
    }

    const steadyEmbed = new EmbedBuilder()
        .setTitle('💪 Steady Income — Potential Per Hour')
        .setDescription(
            '"Potential/hr" assumes you use the command back-to-back every time the cooldown clears — a ceiling, not a guarantee.\n\n' +
                '```\n' + steadyTable + '```\n\n' +
                `🎁 **/daily** — flat $15,000 once every 24 hours (no repeat value)\n` +
                `💬 **Chatting** — $1-$5/message, once per minute, works anywhere`
        )
        .setColor(getColor('economy'));

    let crimeTable = pad('Crime', 16) + pad('Range', 16) + 'Risk\n';
    crimeTable += '-'.repeat(44) + '\n';

    for (const [name, min, max, risk] of CRIME_TIERS) {
        crimeTable += pad(name, 16) + pad(`${money(min)}-${money(max)}`, 16) + `${Math.round(risk * 100)}%\n`;
    }

    const crimeEmbed = new EmbedBuilder()
        .setTitle('🕵️ Crime Payouts')
        .setDescription('Higher reward tiers carry a higher chance of getting caught and jailed.\n\n' + '```\n' + crimeTable + '```')
        .setColor(getColor('economy'))
        .setFooter({ text: 'Getting caught: a fine + jail time. Other members can try to break you out with /jailbreak.' });

    await InteractionHelper.safeEditReply(interaction, { embeds: [jobsEmbed, steadyEmbed, crimeEmbed] });
}

// =====================================================================
// COOLDOWNS
// =====================================================================
const COOLDOWN_ACTIONS = [
    ['🛠️', '/work', 'lastWork', 3 * 60 * 1000],
    ['🙏', '/beg', 'lastBeg', 3 * 60 * 1000],
    ['🎣', '/fish', 'lastFish', 3 * 60 * 1000],
    ['⛏️', '/mine', 'lastMine', 3 * 60 * 1000],
    ['🎁', '/daily', 'lastDaily', 24 * 60 * 60 * 1000],
    ['🎲', '/casino gamble', 'lastGamble', 3 * 60 * 1000],
    ['🎰', '/casino slots', 'lastSlots', 3 * 60 * 1000],
    ['🦹', '/rob', 'lastRob', 4 * 60 * 60 * 1000],
];

function formatRemaining(ms) {
    if (ms <= 0) return '✅ Ready now!';
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `⏳ ${hours}h ${minutes}m`;
    if (minutes > 0) return `⏳ ${minutes}m ${seconds}s`;
    return `⏳ ${seconds}s`;
}

async function executeCooldowns(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const userData = await getEconomyData(client, guildId, userId);
    const now = Date.now();

    const embed = new EmbedBuilder().setTitle(`⏱️ ${interaction.user.username}'s Cooldowns`).setColor(getColor('economy'));

    const isJailed = userData.jailedUntil && userData.jailedUntil > now;
    if (isJailed) {
        const jailRemaining = userData.jailedUntil - now;
        embed.setDescription(`🚔 **You're in jail!** ${formatRemaining(jailRemaining)}\n\nAsk someone to try \`/jailbreak\` to spring you early — 50/50 odds.`);
    }

    const crimeCooldownMs = 2 * 60 * 1000;
    const lastCrime = userData.cooldowns?.crime || 0;
    const crimeRemaining = lastCrime + crimeCooldownMs - now;

    const fields = [{ name: '🕵️ /crime', value: formatRemaining(crimeRemaining), inline: true }];

    for (const [emoji, label, field, cooldownMs] of COOLDOWN_ACTIONS) {
        const last = userData[field] || 0;
        const remaining = last + cooldownMs - now;
        fields.push({ name: `${emoji} ${label}`, value: formatRemaining(remaining), inline: true });
    }

    embed.addFields(fields);
    embed.setFooter({ text: 'Cooldowns update in real time — just re-run /stats cooldowns to refresh.' });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// =====================================================================
// GAMES (formerly /mystats)
// =====================================================================
const GAME_LABELS = {
    gamble: '🎲 Gamble',
    slots: '🎰 Slots',
    blackjack: '🃏 Blackjack',
    coinflip: '🪙 Coinflip',
    rob: '🦹 Rob',
};

async function executeGames(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const summary = await getDailySummary(client, interaction.guildId, interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle(`🎮 ${interaction.user.username}'s Game Corner — Today`)
        .setColor(summary.total >= 0 ? getColor('success') : getColor('error'));

    if (summary.count === 0) {
        embed.setDescription("You haven't played anything today — head to the Game Corner and try `/casino slots`, `/casino blackjack`, `/casino gamble`, `/casino coinflip`, or `/rob`!");
    } else {
        const lines = Object.entries(summary.byGame).map(([game, amount]) => {
            const label = GAME_LABELS[game] || game;
            const sign = amount >= 0 ? '+' : '';
            return `${label}: ${sign}$${amount.toLocaleString()}`;
        });

        embed.setDescription(lines.join('\n'));
        embed.addFields(
            { name: 'Plays Today', value: `${summary.count}`, inline: true },
            { name: 'Net Result', value: `${summary.total >= 0 ? '📈 +' : '📉 '}$${summary.total.toLocaleString()}`, inline: true }
        );
    }

    embed.setFooter({ text: 'Resets at midnight, server time.' });
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// =====================================================================
// DASHBOARD
// =====================================================================
async function executeDashboard(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
    if (!deferred) return;

    const guild = interaction.guild;
    const member = interaction.member;

    const existingRef = await getDashboardRef(client, guild.id, member.id);
    if (existingRef) {
        try {
            const oldChannel = await guild.channels.fetch(existingRef.channelId).catch(() => null);
            if (oldChannel) {
                const oldMessage = await oldChannel.messages.fetch(existingRef.messageId).catch(() => null);
                if (oldMessage) await oldMessage.delete().catch(() => {});
            }
        } catch (error) {
            logger.error(`Error cleaning up old dashboard for ${member.id}:`, error);
        }
        await deleteDashboardRef(client, guild.id, member.id);
    }

    const embed = await buildDashboardEmbed(client, guild, member);
    const message = await interaction.channel.send({ embeds: [embed] });

    await saveDashboardRef(client, guild.id, member.id, interaction.channel.id, message.id);

    await InteractionHelper.safeEditReply(interaction, {
        content: '✅ Your dashboard is live in this channel! It updates automatically — no need to run this again.',
    });
}
