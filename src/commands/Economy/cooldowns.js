import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// [label, command, userData field, cooldown ms]
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
    if (ms <= 0) return '✅ Ready now!';
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `⏳ ${hours}h ${minutes}m`;
    if (minutes > 0) return `⏳ ${minutes}m ${seconds}s`;
    return `⏳ ${seconds}s`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('cooldowns')
        .setDescription('See your current cooldowns for every economy command'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const userData = await getEconomyData(client, guildId, userId);
        const now = Date.now();

        const embed = new EmbedBuilder()
            .setTitle(`⏱️ ${interaction.user.username}'s Cooldowns`)
            .setColor(getColor('economy'));

        // Jail status gets its own prominent line if applicable
        const isJailed = userData.jailedUntil && userData.jailedUntil > now;
        if (isJailed) {
            const jailRemaining = userData.jailedUntil - now;
            embed.setDescription(`🚔 **You're in jail!** ${formatRemaining(jailRemaining)}\n\nAsk someone to try \`/jailbreak\` to spring you early — 50/50 odds.`);
        }

        // Crime uses a nested cooldowns object, not a top-level lastX field
        const crimeCooldownMs = 2 * 60 * 1000;
        const lastCrime = userData.cooldowns?.crime || 0;
        const crimeRemaining = lastCrime + crimeCooldownMs - now;

        const fields = [
            { name: '🕵️ /crime', value: formatRemaining(crimeRemaining), inline: true },
        ];

        for (const [emoji, label, field, cooldownMs] of COOLDOWN_ACTIONS) {
            const last = userData[field] || 0;
            const remaining = last + cooldownMs - now;
            fields.push({ name: `${emoji} ${label}`, value: formatRemaining(remaining), inline: true });
        }

        embed.addFields(fields);
        embed.setFooter({ text: 'Cooldowns update in real time — just re-run /cooldowns to refresh.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'cooldowns' })
};
