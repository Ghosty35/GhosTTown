// commands/Economy/atm.js
//
// A PIN-protected ATM-style interface for Ghost Loans & Savings.
// - First use: sets up a 4-digit PIN (hashed, never stored in plain text).
// - Every use after that: must enter the PIN to open the ATM.
// - 3 wrong attempts in a row locks the account out for 60 seconds.
// - Cash / Bank / Crypto tabs, switchable via a dropdown on the same message.
// - Bank tab: Deposit / Withdraw buttons.
// - Crypto tab: Buy / Sell buttons for the /invest market.

import crypto from 'crypto';
import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { getMarket } from '../../services/investmentService.js';
import { investments, getInvestmentBySymbol } from '../../config/investments.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PIN_LOCKOUT_MS = 60 * 1000;
const MAX_PIN_ATTEMPTS = 3;
const SESSION_TIMEOUT_MS = 3 * 60 * 1000;

function hashPin(pin, userId) {
    return crypto.createHash('sha256').update(`${pin}:${userId}`).digest('hex');
}

function isValidPin(pin) {
    return /^\d{4}$/.test(pin);
}

export default {
    data: new SlashCommandBuilder()
        .setName('atm')
        .setDescription('Open the Ghost Loans & Savings ATM'),

    async execute(interaction) {
        const client = interaction.client;
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.atmLockoutUntil && userData.atmLockoutUntil > Date.now()) {
            const seconds = Math.ceil((userData.atmLockoutUntil - Date.now()) / 1000);
            await interaction.reply({
                content: `🔒 Too many incorrect PIN attempts. Try again in **${seconds}s**.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!userData.atmPinHash) {
            await showSetupModal(interaction, client, guildId, userId);
        } else {
            await showLoginModal(interaction, client, guildId, userId);
        }
    },
};

// ---------------------------------------------------------------------
// PIN SETUP (first time)
// ---------------------------------------------------------------------
async function showSetupModal(interaction, client, guildId, userId) {
    const modal = new ModalBuilder().setCustomId('atm_setup_pin').setTitle('Set Up Your ATM PIN');

    const pinInput = new TextInputBuilder()
        .setCustomId('pin')
        .setLabel('Choose a 4-digit PIN')
        .setStyle(TextInputStyle.Short)
        .setMinLength(4)
        .setMaxLength(4)
        .setPlaceholder('1234')
        .setRequired(true);

    const confirmInput = new TextInputBuilder()
        .setCustomId('confirm')
        .setLabel('Confirm your PIN')
        .setStyle(TextInputStyle.Short)
        .setMinLength(4)
        .setMaxLength(4)
        .setPlaceholder('1234')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(pinInput),
        new ActionRowBuilder().addComponents(confirmInput)
    );

    await interaction.showModal(modal);

    const submitted = await interaction
        .awaitModalSubmit({ filter: (i) => i.customId === 'atm_setup_pin' && i.user.id === userId, time: 120000 })
        .catch(() => null);

    if (!submitted) return;

    const pin = submitted.fields.getTextInputValue('pin').trim();
    const confirm = submitted.fields.getTextInputValue('confirm').trim();

    if (!isValidPin(pin)) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Your PIN must be exactly 4 digits (0-9).' });
        return;
    }

    if (pin !== confirm) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: "PINs didn't match. Run `/atm` again to try once more." });
        return;
    }

    const userData = await getEconomyData(client, guildId, userId);
    userData.atmPinHash = hashPin(pin, userId);
    userData.atmFailedAttempts = 0;
    userData.atmLockoutUntil = 0;
    await setEconomyData(client, guildId, userId, userData);

    await openAtmDashboard(submitted, client, guildId, userId, '✅ PIN set successfully! Welcome to your account.');
}

// ---------------------------------------------------------------------
// PIN LOGIN (returning users)
// ---------------------------------------------------------------------
async function showLoginModal(interaction, client, guildId, userId) {
    const modal = new ModalBuilder().setCustomId('atm_login_pin').setTitle('Ghost Loans & Savings — Enter PIN');

    const pinInput = new TextInputBuilder()
        .setCustomId('pin')
        .setLabel('Enter your 4-digit PIN')
        .setStyle(TextInputStyle.Short)
        .setMinLength(4)
        .setMaxLength(4)
        .setPlaceholder('••••')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(pinInput));

    await interaction.showModal(modal);

    const submitted = await interaction
        .awaitModalSubmit({ filter: (i) => i.customId === 'atm_login_pin' && i.user.id === userId, time: 120000 })
        .catch(() => null);

    if (!submitted) return;

    const enteredPin = submitted.fields.getTextInputValue('pin').trim();
    const userData = await getEconomyData(client, guildId, userId);

    if (hashPin(enteredPin, userId) !== userData.atmPinHash) {
        userData.atmFailedAttempts = (userData.atmFailedAttempts || 0) + 1;

        if (userData.atmFailedAttempts >= MAX_PIN_ATTEMPTS) {
            userData.atmLockoutUntil = Date.now() + PIN_LOCKOUT_MS;
            userData.atmFailedAttempts = 0;
            await setEconomyData(client, guildId, userId, userData);
            await replyUserError(submitted, {
                type: ErrorTypes.VALIDATION,
                message: `❌ Incorrect PIN. Too many attempts — locked out for ${PIN_LOCKOUT_MS / 1000}s.`,
            });
            return;
        }

        await setEconomyData(client, guildId, userId, userData);
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: `❌ Incorrect PIN. ${MAX_PIN_ATTEMPTS - userData.atmFailedAttempts} attempt(s) remaining.`,
        });
        return;
    }

    userData.atmFailedAttempts = 0;
    userData.atmLockoutUntil = 0;
    await setEconomyData(client, guildId, userId, userData);

    await openAtmDashboard(submitted, client, guildId, userId, null);
}

// ---------------------------------------------------------------------
// MAIN DASHBOARD — Cash / Bank / Crypto tabs
// ---------------------------------------------------------------------
async function openAtmDashboard(rootInteraction, client, guildId, userId, welcomeMessage) {
    let currentTab = 'cash';

    const buildEmbed = async () => {
        const userData = await getEconomyData(client, guildId, userId);
        const maxBank = getMaxBankCapacity(userData);

        const embed = new EmbedBuilder()
            .setTitle('🏧 Ghost Loans & Savings — ATM')
            .setColor(getColor('economy'))
            .setFooter({ text: 'Session closes after 3 minutes of inactivity' });

        if (currentTab === 'cash') {
            embed.setDescription(
                '**💵 Cash on Hand**\n\nThe money in your wallet — ready to spend or bet, but **not** protected from `/rob`.'
            );
            embed.addFields({ name: 'Balance', value: `$${(userData.wallet || 0).toLocaleString()}`, inline: true });
        } else if (currentTab === 'bank') {
            embed.setDescription(
                '**🏦 Ghost Savings and Loans Account**\n\nMoney here is safe from `/rob`. Use the buttons below to move money in or out.'
            );
            embed.addFields({
                name: 'Balance',
                value: `$${(userData.bank || 0).toLocaleString()} / $${maxBank.toLocaleString()}`,
                inline: true,
            });
        } else if (currentTab === 'crypto') {
            const market = await getMarket(client, guildId);
            const portfolio = userData.portfolio || {};
            const holdings = Object.entries(portfolio).filter(([, pos]) => pos.shares > 0);

            let totalValue = 0;
            const lines = holdings.map(([symbol, pos]) => {
                const asset = getInvestmentBySymbol(symbol);
                const price = market[symbol]?.price || 0;
                const value = pos.shares * price;
                totalValue += value;
                return `${asset?.emoji || '•'} **${symbol}** — ${pos.shares} shares ($${value.toLocaleString()})`;
            });

            embed.setDescription(
                `**📈 Crypto & Investments**\n\nYour trading portfolio across the GhostCoin market.\n\n${
                    lines.length ? lines.join('\n') : '*No holdings yet — use Buy below to get started.*'
                }`
            );
            embed.addFields({ name: 'Total Portfolio Value', value: `$${totalValue.toLocaleString()}`, inline: true });
        }

        return embed;
    };

    const buildTabRow = () =>
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('atm_tab_select')
                .setPlaceholder('Choose a tab')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cash')
                        .setValue('cash')
                        .setEmoji('💵')
                        .setDefault(currentTab === 'cash'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Bank')
                        .setValue('bank')
                        .setEmoji('🏦')
                        .setDefault(currentTab === 'bank'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Crypto')
                        .setValue('crypto')
                        .setEmoji('📈')
                        .setDefault(currentTab === 'crypto')
                )
        );

    const buildActionRow = () => {
        if (currentTab === 'bank') {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('atm_deposit').setLabel('Deposit').setStyle(ButtonStyle.Success).setEmoji('⬆️'),
                new ButtonBuilder().setCustomId('atm_withdraw').setLabel('Withdraw').setStyle(ButtonStyle.Danger).setEmoji('⬇️')
            );
        }
        if (currentTab === 'crypto') {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('atm_buy_crypto').setLabel('Buy').setStyle(ButtonStyle.Success).setEmoji('📈'),
                new ButtonBuilder().setCustomId('atm_sell_crypto').setLabel('Sell').setStyle(ButtonStyle.Danger).setEmoji('📉')
            );
        }
        return null;
    };

    const buildComponents = () => {
        const rows = [buildTabRow()];
        const actionRow = buildActionRow();
        if (actionRow) rows.push(actionRow);
        return rows;
    };

    await rootInteraction.reply({
        content: welcomeMessage || undefined,
        embeds: [await buildEmbed()],
        components: buildComponents(),
        flags: MessageFlags.Ephemeral,
    });

    const message = await rootInteraction.fetchReply();

    const collector = message.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        time: SESSION_TIMEOUT_MS,
    });

    collector.on('collect', async (i) => {
        try {
            if (i.customId === 'atm_tab_select') {
                currentTab = i.values[0];
                await i.update({ embeds: [await buildEmbed()], components: buildComponents() });
                return;
            }

            if (i.customId === 'atm_deposit' || i.customId === 'atm_withdraw') {
                await handleBankAction(i, client, guildId, userId, i.customId === 'atm_deposit' ? 'deposit' : 'withdraw');
                await InteractionHelper.safeEditReply(rootInteraction, {
                    embeds: [await buildEmbed()],
                    components: buildComponents(),
                });
                return;
            }

            if (i.customId === 'atm_buy_crypto' || i.customId === 'atm_sell_crypto') {
                await handleCryptoAction(i, client, guildId, userId, i.customId === 'atm_buy_crypto' ? 'buy' : 'sell');
                await InteractionHelper.safeEditReply(rootInteraction, {
                    embeds: [await buildEmbed()],
                    components: buildComponents(),
                });
                return;
            }
        } catch (error) {
            logger.error('ATM interaction error:', error);
        }
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
            await InteractionHelper.safeEditReply(rootInteraction, { components: [] }).catch(() => {});
        }
    });
}

// ---------------------------------------------------------------------
// BANK TAB ACTIONS
// ---------------------------------------------------------------------
async function handleBankAction(i, client, guildId, userId, action) {
    const modal = new ModalBuilder()
        .setCustomId(`atm_${action}_modal`)
        .setTitle(action === 'deposit' ? 'Deposit to Ghost Savings and Loans' : 'Withdraw from Ghost Savings and Loans');

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Amount to ${action} (or "all")`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1000')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

    await i.showModal(modal);

    const submitted = await i
        .awaitModalSubmit({ filter: (m) => m.customId === `atm_${action}_modal` && m.user.id === userId, time: 60000 })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('amount').trim();
    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);

    if (action === 'deposit') {
        let amount = raw.toLowerCase() === 'all' ? userData.wallet : parseInt(raw, 10);

        if (isNaN(amount) || amount <= 0) {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Enter a valid positive number or "all".' });
            return;
        }
        if (amount > userData.wallet) amount = userData.wallet;

        const space = maxBank - userData.bank;
        if (space <= 0) {
            await replyUserError(submitted, {
                type: ErrorTypes.VALIDATION,
                message: `Your Ghost Savings and Loans account is full (Max: $${maxBank.toLocaleString()}).`,
            });
            return;
        }
        if (amount > space) amount = space;
        if (amount <= 0) {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'You have no cash available to deposit.' });
            return;
        }

        userData.wallet -= amount;
        userData.bank += amount;
        await setEconomyData(client, guildId, userId, userData);

        await submitted.reply({
            embeds: [successEmbed('✅ Deposit Complete', `Deposited **$${amount.toLocaleString()}** into Ghost Savings and Loans.`)],
            flags: MessageFlags.Ephemeral,
        });
    } else {
        let amount = raw.toLowerCase() === 'all' ? userData.bank : parseInt(raw, 10);

        if (isNaN(amount) || amount <= 0) {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Enter a valid positive number or "all".' });
            return;
        }
        if (amount > userData.bank) amount = userData.bank;
        if (amount <= 0) {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Your Ghost Savings and Loans account is empty.' });
            return;
        }

        userData.bank -= amount;
        userData.wallet += amount;
        await setEconomyData(client, guildId, userId, userData);

        await submitted.reply({
            embeds: [successEmbed('✅ Withdrawal Complete', `Withdrew **$${amount.toLocaleString()}** from Ghost Savings and Loans.`)],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ---------------------------------------------------------------------
// CRYPTO TAB ACTIONS
// ---------------------------------------------------------------------
async function handleCryptoAction(i, client, guildId, userId, action) {
    const modal = new ModalBuilder()
        .setCustomId(`atm_${action}_crypto_modal`)
        .setTitle(action === 'buy' ? 'Buy Shares' : 'Sell Shares');

    const symbolInput = new TextInputBuilder()
        .setCustomId('symbol')
        .setLabel(`Symbol (${investments.map((a) => a.symbol).join(', ')})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('GHST')
        .setRequired(true);

    const sharesInput = new TextInputBuilder()
        .setCustomId('shares')
        .setLabel('Number of shares')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(symbolInput),
        new ActionRowBuilder().addComponents(sharesInput)
    );

    await i.showModal(modal);

    const submitted = await i
        .awaitModalSubmit({ filter: (m) => m.customId === `atm_${action}_crypto_modal` && m.user.id === userId, time: 60000 })
        .catch(() => null);

    if (!submitted) return;

    const symbol = submitted.fields.getTextInputValue('symbol').trim().toUpperCase();
    const shares = parseInt(submitted.fields.getTextInputValue('shares').trim(), 10);
    const asset = getInvestmentBySymbol(symbol);

    if (!asset) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: `\`${symbol}\` is not a tradable asset. Options: ${investments.map((a) => a.symbol).join(', ')}`,
        });
        return;
    }

    if (isNaN(shares) || shares <= 0) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Enter a valid positive number of shares.' });
        return;
    }

    const market = await getMarket(client, guildId);
    const price = market[symbol].price;
    const userData = await getEconomyData(client, guildId, userId);
    userData.portfolio = userData.portfolio || {};

    if (action === 'buy') {
        const cost = price * shares;

        if (userData.wallet < cost) {
            await replyUserError(submitted, {
                type: ErrorTypes.VALIDATION,
                message: `Buying ${shares} shares of ${asset.name} costs $${cost.toLocaleString()}, but you only have $${userData.wallet.toLocaleString()} cash.`,
            });
            return;
        }

        const existing = userData.portfolio[symbol] || { shares: 0, avgCost: 0 };
        const newShares = existing.shares + shares;
        const newAvgCost = (existing.shares * existing.avgCost + shares * price) / newShares;

        userData.portfolio[symbol] = { shares: newShares, avgCost: newAvgCost };
        userData.wallet -= cost;
        await setEconomyData(client, guildId, userId, userData);

        await submitted.reply({
            embeds: [successEmbed('✅ Purchase Complete', `Bought **${shares}** shares of **${asset.name}** for **$${cost.toLocaleString()}**.`)],
            flags: MessageFlags.Ephemeral,
        });
    } else {
        const holding = userData.portfolio[symbol];

        if (!holding || holding.shares < shares) {
            await replyUserError(submitted, {
                type: ErrorTypes.VALIDATION,
                message: `You only own ${holding?.shares || 0} shares of ${asset.name}.`,
            });
            return;
        }

        const proceeds = price * shares;
        holding.shares -= shares;
        if (holding.shares === 0) {
            delete userData.portfolio[symbol];
        }
        userData.wallet += proceeds;
        await setEconomyData(client, guildId, userId, userData);

        await submitted.reply({
            embeds: [successEmbed('✅ Sale Complete', `Sold **${shares}** shares of **${asset.name}** for **$${proceeds.toLocaleString()}**.`)],
            flags: MessageFlags.Ephemeral,
        });
    }
}
