// commands/Economy/atm.js
//
// A PIN-protected ATM-style interface for Ghost Loans & Savings.
// - First use: sets up a 4-digit PIN (hashed, never stored in plain text).
// - Every use after that: must enter the PIN to open the ATM.
// - 3 wrong attempts in a row locks the account out for 60 seconds.
// - Single screen showing Cash / Bank / Crypto balances at once.
// - Deposit All / Withdraw All buttons move everything between cash and bank.
// - Custom Amount button opens a modal with an amount field and a
//   deposit/withdraw toggle (built with LabelBuilder, same pattern your
//   economy_dashboard.js already uses for select-menu fields inside modals).
// - Buy/Sell buttons trade shares on the /invest market.

import crypto from 'crypto';
import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    LabelBuilder,
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
// MAIN DASHBOARD — Cash, Bank, and Crypto shown together on one screen
// ---------------------------------------------------------------------
async function openAtmDashboard(rootInteraction, client, guildId, userId, welcomeMessage) {
    const buildEmbed = async () => {
        const userData = await getEconomyData(client, guildId, userId);
        const maxBank = getMaxBankCapacity(userData);
        const market = await getMarket(client, guildId);
        const portfolio = userData.portfolio || {};
        const holdings = Object.entries(portfolio).filter(([, pos]) => pos.shares > 0);

        let cryptoValue = 0;
        for (const [symbol, pos] of holdings) {
            const price = market[symbol]?.price || 0;
            cryptoValue += pos.shares * price;
        }

        const embed = new EmbedBuilder()
            .setTitle('🏧 Ghost Loans & Savings — ATM')
            .setDescription('Your account at a glance. Use the buttons below to manage your money.')
            .setColor(getColor('economy'))
            .addFields(
                { name: '💵 Cash', value: `$${(userData.wallet || 0).toLocaleString()}`, inline: true },
                { name: '🏦 Bank', value: `$${(userData.bank || 0).toLocaleString()} / $${maxBank.toLocaleString()}`, inline: true },
                { name: '📈 Crypto', value: `$${cryptoValue.toLocaleString()} (${holdings.length} holding${holdings.length === 1 ? '' : 's'})`, inline: true },
                { name: '💰 Net Worth', value: `$${((userData.wallet || 0) + (userData.bank || 0) + cryptoValue).toLocaleString()}`, inline: false }
            )
            .setFooter({ text: 'Bank balance is protected from /rob • Session closes after 3 minutes of inactivity' });

        return embed;
    };

    const buildComponents = () => [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('atm_deposit_all').setLabel('Deposit All').setStyle(ButtonStyle.Success).setEmoji('⬆️'),
            new ButtonBuilder().setCustomId('atm_withdraw_all').setLabel('Withdraw All').setStyle(ButtonStyle.Danger).setEmoji('⬇️'),
            new ButtonBuilder().setCustomId('atm_custom_amount').setLabel('Custom Amount').setStyle(ButtonStyle.Primary).setEmoji('✏️')
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('atm_buy_crypto').setLabel('Buy Crypto').setStyle(ButtonStyle.Secondary).setEmoji('📈'),
            new ButtonBuilder().setCustomId('atm_sell_crypto').setLabel('Sell Crypto').setStyle(ButtonStyle.Secondary).setEmoji('📉')
        ),
    ];

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
            if (i.customId === 'atm_deposit_all') {
                await handleDepositAll(client, guildId, userId);
                await i.update({ embeds: [await buildEmbed()], components: buildComponents() });
                return;
            }

            if (i.customId === 'atm_withdraw_all') {
                await handleWithdrawAll(client, guildId, userId);
                await i.update({ embeds: [await buildEmbed()], components: buildComponents() });
                return;
            }

            if (i.customId === 'atm_custom_amount') {
                await handleCustomAmount(i, client, guildId, userId);
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
// DEPOSIT ALL / WITHDRAW ALL — instant, no modal needed
// ---------------------------------------------------------------------
async function handleDepositAll(client, guildId, userId) {
    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);
    const space = maxBank - userData.bank;

    const amount = Math.max(0, Math.min(userData.wallet, space));
    if (amount <= 0) return;

    userData.wallet -= amount;
    userData.bank += amount;
    await setEconomyData(client, guildId, userId, userData);
}

async function handleWithdrawAll(client, guildId, userId) {
    const userData = await getEconomyData(client, guildId, userId);
    const amount = userData.bank;
    if (amount <= 0) return;

    userData.bank -= amount;
    userData.wallet += amount;
    await setEconomyData(client, guildId, userId, userData);
}

// ---------------------------------------------------------------------
// CUSTOM AMOUNT — modal with amount field + deposit/withdraw toggle
// ---------------------------------------------------------------------
async function handleCustomAmount(i, client, guildId, userId) {
    const modal = new ModalBuilder().setCustomId('atm_custom_amount_modal').setTitle('Custom Transaction');

    const directionSelect = new StringSelectMenuBuilder()
        .setCustomId('direction')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Deposit (Cash → Bank)').setValue('deposit').setEmoji('⬆️'),
            new StringSelectMenuOptionBuilder().setLabel('Withdraw (Bank → Cash)').setValue('withdraw').setEmoji('⬇️')
        );

    const directionLabel = new LabelBuilder()
        .setLabel('Direction')
        .setDescription('Choose whether to deposit or withdraw')
        .setStringSelectMenuComponent(directionSelect);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1000')
        .setRequired(true);

    modal.addLabelComponents(directionLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

    await i.showModal(modal);

    const submitted = await i
        .awaitModalSubmit({ filter: (m) => m.customId === 'atm_custom_amount_modal' && m.user.id === userId, time: 60000 })
        .catch(() => null);

    if (!submitted) return;

    const direction = submitted.fields.getField('direction').values[0];
    const rawAmount = submitted.fields.getTextInputValue('amount').trim();
    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);

    let amount = parseInt(rawAmount, 10);
    if (isNaN(amount) || amount <= 0) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Enter a valid positive whole number.' });
        return;
    }

    if (direction === 'deposit') {
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
// CRYPTO ACTIONS
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
