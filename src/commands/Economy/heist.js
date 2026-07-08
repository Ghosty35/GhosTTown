import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { successEmbed, warningEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { investments } from '../../config/investments.js';
import { getMarket } from '../../services/investmentService.js';
import { logger } from '../../utils/logger.js';

// ── Tunable values ──────────────────────────────────────────────
const SUCCESS_RATE = 0.30;                 // 30% win, 70% fail
const JAIL_TIME = 5 * 60 * 1000;           // 5 minutes in jail on failure
const HEIST_COOLDOWN = 15 * 60 * 1000;     // per-user cooldown between heists
const INVITE_TIMEOUT = 60 * 1000;          // partner has 60s to accept
const LOOT_MULT_MIN = 0.6;                 // loot = total market index × random(0.6–1.6)
const LOOT_MULT_MAX = 1.6;                 // (rebalanced after base prices were raised)
const MARKET_CRASH_MIN = 0.05;             // successful heist knocks every asset
const MARKET_CRASH_MAX = 0.10;             // down 5–10% (you robbed the market!)
// ────────────────────────────────────────────────────────────────

function marketKey(guildId) {
    return `investments:${guildId}`;
}

function isJailed(userData, now) {
    return userData.jailedUntil && userData.jailedUntil > now;
}

function jailMinutesLeft(userData, now) {
    return Math.ceil((userData.jailedUntil - now) / (1000 * 60));
}

/**
 * Loot scales with the live market: sum every asset's current price
 * ("the market index") and multiply by a random factor. This means a
 * booming market = bigger heists, a crashed market = slim pickings,
 * which gives players a reason to watch /invest market.
 */
async function calculatePotentialLoot(client, guildId) {
    const market = await getMarket(client, guildId);
    let indexValue = 0;
    for (const asset of investments) {
        indexValue += market[asset.symbol]?.price ?? asset.basePrice;
    }
    const multiplier = LOOT_MULT_MIN + Math.random() * (LOOT_MULT_MAX - LOOT_MULT_MIN);
    return Math.max(100, Math.round(indexValue * multiplier));
}

/** On success the crew "drains" the market — every asset dips 5–10%. */
async function crashMarket(client, guildId) {
    const market = await getMarket(client, guildId);
    for (const asset of investments) {
        const entry = market[asset.symbol];
        if (!entry) continue;
        const drop = MARKET_CRASH_MIN + Math.random() * (MARKET_CRASH_MAX - MARKET_CRASH_MIN);
        entry.prevPrice = entry.price;
        entry.price = Math.max(1, Math.round(entry.price * (1 - drop)));
        entry.updatedAt = Date.now();
    }
    await client.db.set(marketKey(guildId), market);
}

export default {
    data: new SlashCommandBuilder()
        .setName('heist')
        .setDescription('Team up and rob the stock market — high risk, high reward')
        .addSubcommand((sub) =>
            sub
                .setName('start')
                .setDescription('Invite a partner to pull off a stock market heist (30% success)')
                .addUserOption((opt) =>
                    opt.setName('partner').setDescription('Your partner in crime').setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('bail').setDescription('Pay your heist fine to get out of jail early')
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const now = Date.now();

        // ── /heist bail ─────────────────────────────────────────
        if (subcommand === 'bail') {
            const userData = await getEconomyData(client, guildId, userId);

            if (!isJailed(userData, now)) {
                throw createError('Not in jail', ErrorTypes.VALIDATION, "You're not in jail right now — nothing to bail out of!");
            }

            const fine = userData.heistFine || 0;
            if (fine <= 0) {
                const minsLeft = jailMinutesLeft(userData, now);
                throw createError(
                    'No bail available',
                    ErrorTypes.VALIDATION,
                    `You weren't jailed for a heist, so there's no fine to pay. Sit out your remaining **${minsLeft} minute(s)**.`
                );
            }

            if ((userData.wallet || 0) < fine) {
                const minsLeft = jailMinutesLeft(userData, now);
                throw createError(
                    'Insufficient funds',
                    ErrorTypes.VALIDATION,
                    `Your bail is **$${fine.toLocaleString()}** but you only have **$${(userData.wallet || 0).toLocaleString()}** in your wallet.\nSit out your remaining **${minsLeft} minute(s)** instead.`
                );
            }

            userData.wallet -= fine;
            userData.jailedUntil = 0;
            userData.heistFine = 0;
            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '💸 Bail Paid',
                        `You paid your **$${fine.toLocaleString()}** fine and walked free.\nNew wallet balance: **$${userData.wallet.toLocaleString()}**`
                    ),
                ],
            });
            return;
        }

        // ── /heist start ────────────────────────────────────────
        const partner = interaction.options.getUser('partner');

        if (partner.id === userId) {
            throw createError('Invalid partner', ErrorTypes.VALIDATION, 'You need a *partner* — you can\'t heist alone. Pick another member.');
        }
        if (partner.bot) {
            throw createError('Invalid partner', ErrorTypes.VALIDATION, "Bots make terrible getaway drivers. Pick a real member.");
        }

        const initiatorData = await getEconomyData(client, guildId, userId);

        if (isJailed(initiatorData, now)) {
            throw createError(
                'You are in jail',
                ErrorTypes.VALIDATION,
                `You're in jail for **${jailMinutesLeft(initiatorData, now)} more minute(s)**! Use \`/heist bail\` to pay your fine, or wait it out.`
            );
        }

        const lastHeist = initiatorData.cooldowns?.heist || 0;
        if (now < lastHeist + HEIST_COOLDOWN) {
            const minsLeft = Math.ceil((lastHeist + HEIST_COOLDOWN - now) / (1000 * 60));
            throw createError(
                'Heist on cooldown',
                ErrorTypes.RATE_LIMIT,
                `The market's security is on high alert. Wait **${minsLeft} more minute(s)** before your next heist.`
            );
        }

        // Lock in the score before the invite so both players know the stakes.
        const potentialLoot = await calculatePotentialLoot(client, guildId);
        const sharePerPerson = Math.floor(potentialLoot / 2);

        const inviteEmbed = infoEmbed(
            '🏦 Stock Market Heist',
            `${interaction.user.toString()} wants to team up with ${partner.toString()} to rob the **Stock Market Vault**!\n\n` +
                `💰 **Potential score:** $${potentialLoot.toLocaleString()} ($${sharePerPerson.toLocaleString()} each)\n` +
                `🎲 **Success chance:** ${Math.round(SUCCESS_RATE * 100)}%\n` +
                `🚔 **If caught:** both go to jail for **5 minutes** and owe a **$${sharePerPerson.toLocaleString()}** fine each\n\n` +
                `${partner.toString()} — are you in?`
        ).setFooter({ text: `You have ${INVITE_TIMEOUT / 1000} seconds to decide.` });

        const buildRow = (disabled = false) =>
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('heist_accept').setLabel("I'm in 😈").setStyle(ButtonStyle.Success).setDisabled(disabled),
                new ButtonBuilder().setCustomId('heist_decline').setLabel('Too risky 🏃').setStyle(ButtonStyle.Danger).setDisabled(disabled)
            );

        await InteractionHelper.safeEditReply(interaction, {
            content: partner.toString(),
            embeds: [inviteEmbed],
            components: [buildRow()],
        });
        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: INVITE_TIMEOUT,
            filter: (i) => i.user.id === partner.id,
        });

        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'heist_decline') {
                    collector.stop('declined');
                    await i.update({
                        content: '',
                        embeds: [warningEmbed('🏃 Heist Called Off', `${partner.toString()} backed out. The vault lives another day.`)],
                        components: [],
                    });
                    return;
                }

                // Accepted — re-validate both players at the moment of the heist.
                collector.stop('accepted');
                const heistNow = Date.now();

                const freshInitiator = await getEconomyData(client, guildId, userId);
                const freshPartner = await getEconomyData(client, guildId, partner.id);

                if (isJailed(freshPartner, heistNow)) {
                    await i.update({
                        content: '',
                        embeds: [warningEmbed('🚔 Heist Called Off', `${partner.toString()} is in jail for **${jailMinutesLeft(freshPartner, heistNow)} more minute(s)** — hard to rob a vault from a cell.`)],
                        components: [],
                    });
                    return;
                }

                const partnerLastHeist = freshPartner.cooldowns?.heist || 0;
                if (heistNow < partnerLastHeist + HEIST_COOLDOWN) {
                    const minsLeft = Math.ceil((partnerLastHeist + HEIST_COOLDOWN - heistNow) / (1000 * 60));
                    await i.update({
                        content: '',
                        embeds: [warningEmbed('🕵️ Heist Called Off', `${partner.toString()} is still too hot from their last heist — **${minsLeft} minute(s)** left on their cooldown.`)],
                        components: [],
                    });
                    return;
                }

                // Both on cooldown from this moment, win or lose.
                freshInitiator.cooldowns = freshInitiator.cooldowns || {};
                freshPartner.cooldowns = freshPartner.cooldowns || {};
                freshInitiator.cooldowns.heist = heistNow;
                freshPartner.cooldowns.heist = heistNow;

                const success = Math.random() < SUCCESS_RATE;

                if (success) {
                    freshInitiator.wallet = (freshInitiator.wallet || 0) + sharePerPerson;
                    freshPartner.wallet = (freshPartner.wallet || 0) + sharePerPerson;

                    await setEconomyData(client, guildId, userId, freshInitiator);
                    await setEconomyData(client, guildId, partner.id, freshPartner);
                    await crashMarket(client, guildId);

                    await i.update({
                        content: '',
                        embeds: [
                            successEmbed(
                                '💰 HEIST SUCCESSFUL!',
                                `${interaction.user.toString()} and ${partner.toString()} cracked the **Stock Market Vault** and made off with **$${potentialLoot.toLocaleString()}**!\n\n` +
                                    `💵 Each of you pockets **$${sharePerPerson.toLocaleString()}**.\n` +
                                    `📉 The heist shook investor confidence — **all market prices just dropped 5–10%**. Might be a good time to buy the dip with \`/invest buy\`...`
                            ),
                        ],
                        components: [],
                    });
                } else {
                    freshInitiator.jailedUntil = heistNow + JAIL_TIME;
                    freshPartner.jailedUntil = heistNow + JAIL_TIME;
                    freshInitiator.heistFine = sharePerPerson;
                    freshPartner.heistFine = sharePerPerson;

                    await setEconomyData(client, guildId, userId, freshInitiator);
                    await setEconomyData(client, guildId, partner.id, freshPartner);

                    await i.update({
                        content: '',
                        embeds: [
                            warningEmbed(
                                '🚨 HEIST FAILED!',
                                `The alarms went off! ${interaction.user.toString()} and ${partner.toString()} were caught red-handed trying to steal **$${potentialLoot.toLocaleString()}**.\n\n` +
                                    `🚔 Both of you are in **jail for 5 minutes**.\n` +
                                    `💸 Bail is set at **$${sharePerPerson.toLocaleString()}** each — pay with \`/heist bail\`, or sit out your time.`
                            ),
                        ],
                        components: [],
                    });
                }
            } catch (error) {
                logger.error('Error resolving heist:', error);
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason !== 'time') return;
            try {
                await InteractionHelper.safeEditReply(interaction, {
                    content: '',
                    embeds: [warningEmbed('⌛ Heist Expired', `${partner.toString()} never showed up to the rendezvous. Invite expired.`)],
                    components: [],
                });
            } catch (error) {
                logger.error('Error expiring heist invite:', error);
            }
        });
    }, { command: 'heist' })
};
