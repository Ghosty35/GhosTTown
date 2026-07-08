import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { jobs } from '../../config/jobs.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Steady income commands: [label, min, max, cooldownSeconds]
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

export default {
    data: new SlashCommandBuilder()
        .setName('earnings')
        .setDescription('See a full breakdown of every way to earn GhostCoins'),

    execute: withErrorHandling(async (interaction) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        // -----------------------------------------------------------
        // JOBS TABLE — hourly / daily / weekly rate
        // -----------------------------------------------------------
        let jobsTable = pad('Job', 16) + pad('Hour', 10) + pad('Day', 12) + 'Week\n';
        jobsTable += '-'.repeat(50) + '\n';

        for (const job of jobs) {
            const avgWeekly = (job.weeklyPay.min + job.weeklyPay.max) / 2;
            const avgDaily = avgWeekly / 7;
            const avgHourly = avgDaily / 24;

            jobsTable +=
                pad(job.name, 16) +
                pad(money(avgHourly), 10) +
                pad(money(avgDaily), 12) +
                `${money(job.weeklyPay.min)}-${money(job.weeklyPay.max)}\n`;
        }

        const jobsEmbed = new EmbedBuilder()
            .setTitle('💼 Job Earnings')
            .setDescription(
                'Average rate if you held the job passively — you get paid automatically every 7 days regardless.\n\n' +
                    '```\n' + jobsTable + '```'
            )
            .setColor(getColor('economy'))
            .setFooter({ text: 'Requires the matching license from /shop — see /job list' });

        // -----------------------------------------------------------
        // STEADY INCOME — potential per hour if spammed on cooldown
        // -----------------------------------------------------------
        let steadyTable = pad('Command', 10) + pad('Range', 16) + pad('Cooldown', 10) + 'Potential/hr\n';
        steadyTable += '-'.repeat(52) + '\n';

        for (const [label, min, max, cooldownSec] of STEADY_INCOME) {
            const avg = (min + max) / 2;
            const usesPerHour = 3600 / cooldownSec;
            const potential = avg * usesPerHour;

            steadyTable +=
                pad(label, 10) +
                pad(`${money(min)}-${money(max)}`, 16) +
                pad(`${cooldownSec / 60}m`, 10) +
                money(potential) + '\n';
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

        // -----------------------------------------------------------
        // CRIME TIERS
        // -----------------------------------------------------------
        let crimeTable = pad('Crime', 16) + pad('Range', 16) + 'Risk\n';
        crimeTable += '-'.repeat(44) + '\n';

        for (const [name, min, max, risk] of CRIME_TIERS) {
            crimeTable += pad(name, 16) + pad(`${money(min)}-${money(max)}`, 16) + `${Math.round(risk * 100)}%\n`;
        }

        const crimeEmbed = new EmbedBuilder()
            .setTitle('🕵️ Crime Payouts')
            .setDescription(
                'Higher reward tiers carry a higher chance of getting caught and jailed.\n\n' + '```\n' + crimeTable + '```'
            )
            .setColor(getColor('economy'))
            .setFooter({ text: 'Getting caught: a fine + jail time. Other members can try to break you out with /jailbreak.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [jobsEmbed, steadyEmbed, crimeEmbed] });
    }, { command: 'earnings' })
};
