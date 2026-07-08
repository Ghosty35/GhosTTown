// roastService.js
//
// The Roast Channel engine. When a channel is designated as the roast
// channel (via /roast-channel), the bot replies to every message in it
// with a roast — mixing three flavors so it feels like a conversation:
//
//   1. CONTEXTUAL — keyword-matched comebacks (greetings, insults at the
//      bot, laughing, bragging, questions...), so it "responds" to what
//      the member actually said.
//   2. PERSONAL — savage burns built from their real economy stats
//      (broke wallet, jobless, in jail, bleeding money on stocks).
//   3. GENERIC — a big pool of all-purpose roasts as the fallback.
//
// All roasts are playful server-banter tier: they punch at in-game
// failure and chat behavior, never at real-life traits.

import { getEconomyData } from '../utils/economy.js';
import { logger } from '../utils/logger.js';

function roastKey(guildId) {
    return `roastChannel:${guildId}`;
}

export async function getRoastChannel(client, guildId) {
    return await client.db.get(roastKey(guildId), null);
}

export async function setRoastChannel(client, guildId, channelId) {
    await client.db.set(roastKey(guildId), channelId);
}

export async function disableRoastChannel(client, guildId) {
    await client.db.delete(roastKey(guildId));
}

// Per-user reply cooldown so someone spamming doesn't flood the channel
// with bot replies. In-memory on purpose (harmless to lose on restart).
const ROAST_COOLDOWN = 6 * 1000;
const lastRoastAt = new Map();

function onCooldown(userId) {
    const now = Date.now();
    const last = lastRoastAt.get(userId) || 0;
    if (now - last < ROAST_COOLDOWN) return true;
    lastRoastAt.set(userId, now);
    return false;
}

// ---------------------------------------------------------------------
// 1) CONTEXTUAL COMEBACKS — first matching category wins
// ---------------------------------------------------------------------
const CONTEXTUAL = [
    {
        match: /\b(hi|hii+|hello|hey|heyy+|yo|sup|wass?up|good\s*morning|gm)\b/i,
        lines: [
            "Oh great, {user} is here. And the channel was having such a nice day.",
            "Hey {user}! I'd say welcome back, but nobody noticed you left.",
            "{user} says hi like anyone was waiting for them. Adorable.",
            "Morning {user}. The ghosts saw you coming and chose to stay dead.",
            "Sup {user}. Quick question — who invited you?",
        ],
    },
    {
        match: /\bhow (are|r) (you|u)\b|\bhow('?s| is) it going\b/i,
        lines: [
            "I was doing great until this notification, {user}.",
            "Better than your balance, {user}. But that's a low bar.",
            "Living my best life watching you fumble yours, {user}.",
        ],
    },
    {
        match: /\b(roast me|do your worst|come at me|try me)\b/i,
        lines: [
            "{user} asking to be roasted... your life choices already did my job for me.",
            "Roast you? {user}, your `/rob` success rate roasts you daily.",
            "I would, {user}, but bullying the pre-defeated feels wrong.",
            "You want a roast? Check your portfolio, {user}. Self-service.",
        ],
    },
    {
        match: /\b(bad bot|trash|garbage|dumb|stupid|shut up|stfu|useless|mid|you suck|u suck)\b/i,
        lines: [
            "Big words from someone who begs a Discord bot for coins, {user}.",
            "{user} calling ME trash while typing from the jail cell of life.",
            "I'm 'useless'? I literally pay your salary, {user}. Know your employer.",
            "Careful {user}, I control the slot machine. Choose your next words wisely. 🎰",
            "{user}, I've seen your gamble history. You're not qualified to judge anything.",
        ],
    },
    {
        match: /\b(love (you|u)|good bot|nice bot|best bot|thank(s| you)|ty)\b/i,
        lines: [
            "Flattery won't fix your win rate, {user}.",
            "Aww, {user}. Still not boosting your daily. Nice try though.",
            "Save the sweet talk for someone who hasn't seen your `/beg` history, {user}.",
        ],
    },
    {
        match: /\b(lol|lmao+|lmfao|haha+|xd|😂|🤣)\b/i,
        lines: [
            "Glad you're laughing, {user}. Your bank account isn't.",
            "{user} laughing like they didn't lose their whole wallet on slots yesterday.",
            "Keep laughing {user}, the market's laughing at YOUR portfolio.",
        ],
    },
    {
        match: /\b(i'?m rich|im rich|so much money|stack(ed|s)|balling|millionaire|billionaire)\b/i,
        lines: [
            "Rich? {user}, I've seen your balance. Inflation called — even it feels bad for you.",
            "{user} flexing GhostCoins like they're not one bad `/gamble` from `/beg`.",
            "Congrats on the money, {user}. The casino will hold it for you shortly. 🎰",
        ],
    },
    {
        match: /\b(sad|crying|cry|i lost|rip|pain|why me|unlucky)\b|😭|💀/i,
        lines: [
            "There there, {user}. Have you tried being better?",
            "{user} down bad AGAIN. At this point it's a lifestyle, not luck.",
            "Losses build character, {user}. You must have SO much character by now.",
        ],
    },
    {
        match: /\b(no u|no you|you too|ur mom|your mom)\b/i,
        lines: [
            "'No u'? Devastating, {user}. Truly the wordplay of a Cybercrime specialist.",
            "{user} really dusted off 'no u' from 2016. The vault has better security than your comebacks.",
        ],
    },
    {
        match: /\b(bye|goodnight|gn|cya|see ya|leaving|im out|i'?m out)\b/i,
        lines: [
            "Bye {user}! Best thing you've said all day.",
            "Leaving already, {user}? The economy just got 1% stronger.",
            "Goodnight {user}. Dream about winning for once.",
        ],
    },
    {
        match: /\?$/,
        lines: [
            "Great question, {user}. Almost as great as 'why is my wallet empty?' — which you should also ask.",
            "{user}, I'd answer, but watching you figure it out is funnier.",
            "You're asking ME, {user}? Bold move from someone who lost a coinflip to gravity.",
        ],
    },
];

// ---------------------------------------------------------------------
// 2) PERSONAL STAT-BASED ROASTS
// ---------------------------------------------------------------------
function buildStatRoasts(userData) {
    const roasts = [];
    const now = Date.now();
    const wallet = userData.wallet || 0;
    const bank = userData.bank || 0;

    if (wallet <= 0) {
        roasts.push(
            "{user} out here talking with a wallet of exactly $0. Even `/beg` is embarrassed for you.",
            "{user}, your wallet is so empty it echoes. Say something? It just did — 'broke... broke... broke...'"
        );
    } else if (wallet < 500) {
        roasts.push(
            "{user} has less money than a `/beg` payout. Let that sink in.",
            "{user}'s net worth couldn't buy a single share of Farmland Co-op. FARMLAND, {user}."
        );
    }

    if (wallet > 100000 && bank <= 0) {
        roasts.push(
            "{user} walking around with their whole fortune in cash. `/rob` mains, dinner is served. 🍽️"
        );
    }

    if (userData.jailedUntil && userData.jailedUntil > now) {
        roasts.push(
            "{user} really typing from JAIL right now. Even the guards are laughing.",
            "Everything you say can and will be used against you, {user}. Mostly by me. From your cell."
        );
    }

    if (!userData.currentJob) {
        roasts.push(
            "{user} giving life advice while unemployed in a FAKE economy. Incredible.",
            "Jobless in GhostTown, {user}? The bar was on the floor and you brought a shovel."
        );
    }

    const portfolio = userData.portfolio || {};
    const holdings = Object.values(portfolio).filter((p) => p.shares > 0);
    if (holdings.length === 0) {
        roasts.push(
            "{user} has zero stocks. The market drifts UP automatically and you STILL found a way to miss out."
        );
    }

    if ((userData.dailyStreak || 0) === 0) {
        roasts.push(
            "{user} can't even keep a `/daily` streak alive. Commitment issues AND poverty? Iconic."
        );
    }

    return roasts;
}

// ---------------------------------------------------------------------
// 3) GENERIC ROAST POOL
// ---------------------------------------------------------------------
const GENERIC = [
    "{user}, I've seen better takes from the `/beg` command's error messages.",
    "Somewhere out there a slot machine is spinning three 💀s in your honor, {user}.",
    "{user} types like their keyboard is also trying to leave the conversation.",
    "The Server Exchange dips every time you go online, {user}. Coincidence? The data says no. 📉",
    "{user}, you're the human version of a failed jailbreak — bold attempt, instant regret.",
    "If Ls were GhostCoins you'd finally be rich, {user}.",
    "{user}, even the counting channel thinks you can't keep up.",
    "You bring everyone so much joy, {user}. When you stop typing.",
    "I'd explain it to you, {user}, but I left my crayons in the vault.",
    "{user} is proof the bot needs a `/block` command for its own wellbeing.",
    "The dealer doesn't even shuffle for you anymore, {user}. Why bother?",
    "{user}, your luck is so bad the Lucky Clover filed a restraining order. 🍀",
    "NPCs in GhostTown have better dialogue than this, {user}.",
    "{user} would lose a coinflip with a two-headed coin.",
    "Your portfolio called, {user}. It wants to be emancipated.",
    "{user}, you're the reason the heist success rate is only 30%.",
    "I'm a bot and even I felt secondhand embarrassment reading that, {user}.",
    "{user} really said that with their whole chest and their empty wallet.",
    "The ghosts avoid YOU, {user}. Think about that.",
    "{user}, you couldn't hit 7️⃣7️⃣7️⃣ in a dream sequence.",
    "Every server has a main character, {user}. You're the loading screen.",
    "{user}, your comebacks have a longer cooldown than `/rob`.",
    "Talking to you is like the FARM stock, {user} — low volatility, no excitement.",
    "You're not the worst, {user}. You're just consistently mid, which is somehow sadder.",
    "{user}, the Bank Manager saw your account and took a personal day.",
    "Even MoonShot Ventures wouldn't take a risk on you, {user}. 🚀",
    "{user}, if I had feelings, that message would've bored them to death.",
    "The 'Jobless' role fits you like it was tailored, {user}.",
    "{user}, you gamble like the house needed a charity win.",
    "Somewhere a Diamond Pickaxe is mining more personality than you've ever had, {user}. 💎",
];

// ---------------------------------------------------------------------
// Main entry — called from messageCreate for messages in the roast channel
// ---------------------------------------------------------------------
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export async function handleRoastMessage(message, client) {
    try {
        const roastChannelId = await getRoastChannel(client, message.guild.id);
        if (!roastChannelId || message.channel.id !== roastChannelId) return false;

        // Don't roast people trying to run commands in there.
        const prefix = client.config?.bot?.prefix || '!';
        if (message.content.startsWith(prefix) || message.content.startsWith('/')) return true;

        if (onCooldown(message.author.id)) return true;

        // Decide the flavor: contextual > personal (40%) > generic.
        let line = null;

        for (const category of CONTEXTUAL) {
            if (category.match.test(message.content)) {
                line = pick(category.lines);
                break;
            }
        }

        if (!line && Math.random() < 0.4) {
            const userData = await getEconomyData(client, message.guild.id, message.author.id);
            const statRoasts = buildStatRoasts(userData);
            if (statRoasts.length > 0) {
                line = pick(statRoasts);
            }
        }

        if (!line) {
            line = pick(GENERIC);
        }

        const roast = line.replaceAll('{user}', message.author.toString());

        // A little typing delay so it feels like a conversation, not a trigger.
        await message.channel.sendTyping();
        const delay = 800 + Math.random() * 1500;
        setTimeout(() => {
            message.reply({ content: roast, allowedMentions: { repliedUser: true } }).catch((err) => {
                logger.error('Failed to send roast reply:', err);
            });
        }, delay);

        return true;
    } catch (error) {
        logger.error('Error in roast channel handler:', error);
        return false;
    }
}
