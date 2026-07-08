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
// 0) SMART LAYER — real answers to real-life questions, in roast character
//
// Runs before the roast picker. Handles:
//   • Weather  — live data from Open-Meteo (free, no API key needed)
//   • Time / date questions
//   • Math     — "what's 128 * 42" style arithmetic
//   • Anything else question-shaped → answered by AI, IF the server
//     owner has set ANTHROPIC_API_KEY in the .env (optional).
// ---------------------------------------------------------------------

const WEATHER_CODES = {
    0: '☀️ clear skies', 1: '🌤️ mostly clear', 2: '⛅ partly cloudy', 3: '☁️ overcast',
    45: '🌫️ foggy', 48: '🌫️ icy fog', 51: '🌦️ light drizzle', 53: '🌦️ drizzle',
    55: '🌧️ heavy drizzle', 61: '🌧️ light rain', 63: '🌧️ rain', 65: '🌧️ heavy rain',
    66: '🌧️ freezing rain', 67: '🌧️ heavy freezing rain', 71: '🌨️ light snow',
    73: '🌨️ snow', 75: '❄️ heavy snow', 77: '❄️ snow grains', 80: '🌦️ light showers',
    81: '🌧️ showers', 82: '⛈️ violent showers', 85: '🌨️ snow showers',
    86: '❄️ heavy snow showers', 95: '⛈️ thunderstorm', 96: '⛈️ thunderstorm with hail',
    99: '⛈️ severe thunderstorm with hail',
};

async function fetchWithTimeout(url, ms = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function answerWeather(content, username) {
    const match = content.match(
        /(?:weather|temperature|temp|how (?:hot|cold|warm) is it|is it (?:raining|snowing|sunny|cold|hot))\s*(?:like\s*)?(?:in|at|for)?\s+([a-zA-Z\u00C0-\u024F' .-]{2,40})\??$/i
    ) || content.match(/^weather\s+([a-zA-Z\u00C0-\u024F' .-]{2,40})\??$/i);

    if (!match) {
        // Weather asked but no place given.
        if (/\b(weather|temperature|how (hot|cold|warm) is it|is it raining)\b/i.test(content)) {
            return `I'd love to tell you the weather, ${username}, but you forgot to mention WHERE. Try "weather in Amsterdam" — I know geography is hard for you. 🌍`;
        }
        return null;
    }

    const place = match[1].trim();
    const geo = await fetchWithTimeout(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en`
    );
    const loc = geo?.results?.[0];
    if (!loc) {
        return `"${place}"? Never heard of it, ${username}. Either it doesn't exist or your spelling just committed a crime worse than \`/crime\`. 🗺️`;
    }

    const wx = await fetchWithTimeout(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`
    );
    const cur = wx?.current;
    if (!cur) {
        return `The weather service ghosted me, ${username}. Even APIs don't want to talk to you. Try again in a minute.`;
    }

    const desc = WEATHER_CODES[cur.weather_code] || '🌍 some weather';
    const name = `${loc.name}${loc.country ? `, ${loc.country}` : ''}`;
    return (
        `🌡️ **${name}** right now: **${Math.round(cur.temperature_2m)}°C** (feels like ${Math.round(cur.apparent_temperature)}°C), ${desc}, ` +
        `💨 wind ${Math.round(cur.wind_speed_10m)} km/h, 💧 humidity ${cur.relative_humidity_2m}%.\n` +
        `There, ${username} — I did in 2 seconds what a window could've done for free.`
    );
}

function answerTimeDate(content, username) {
    if (/\bwhat(?:'s| is)? (?:the )?time\b|\bwhat time is it\b/i.test(content)) {
        return `It's <t:${Math.floor(Date.now() / 1000)}:t> right now, ${username}. Yes, that's your OWN timezone — even I can't fix your sleep schedule. 🕐`;
    }
    if (/\bwhat(?:'s| is)? (?:the )?(?:date|day)( today)?\b|\bwhat day is it\b/i.test(content)) {
        return `Today is <t:${Math.floor(Date.now() / 1000)}:D>, ${username}. Losing track of the days? The unemployment is showing. 📅`;
    }
    return null;
}

function answerMath(content, username) {
    const match = content.match(/(?:what(?:'s| is)\s+|calculate\s+|^)([\d\s+\-*/().^%]{3,60})[=?]*\s*$/i);
    if (!match) return null;
    const expr = match[1].trim();
    if (!/\d/.test(expr) || !/[+\-*/^%]/.test(expr)) return null;
    if (!/^[\d\s+\-*/().^%]+$/.test(expr)) return null;

    try {
        const result = Function(`"use strict"; return (${expr.replaceAll('^', '**')});`)();
        if (typeof result !== 'number' || !Number.isFinite(result)) return null;
        const rounded = Math.round(result * 10000) / 10000;
        return `${expr} = **${rounded.toLocaleString()}**. A calculator has entered the chat because ${username} couldn't. 🧮`;
    } catch {
        return null;
    }
}

function looksLikeQuestion(content) {
    return (
        /\?/.test(content) ||
        /^(who|what|when|where|why|how|can|could|does|do|did|is|are|was|were|should|would|will|tell me|show me|explain|define|give me)\b/i.test(content.trim())
    );
}

async function answerWithAI(content, username) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: 'claude-haiku-4-5',
                max_tokens: 300,
                system:
                    'You are the resident roast-bot of a Discord server called GhostTown. ' +
                    'A member asked you a question in the roast channel. Answer it genuinely and correctly ' +
                    '(this is the priority — be actually helpful), but wrap it in playful, PG-13 roast energy ' +
                    'aimed at the asker. Light teasing about them asking a bot, never slurs, never cruelty about ' +
                    'real-life traits, no adult content. Keep it under 120 words. Plain text only, Discord-friendly. ' +
                    `The member's display name is "${username}".`,
                messages: [{ role: 'user', content: content.slice(0, 500) }],
            }),
        });
        clearTimeout(timer);

        if (!response.ok) {
            logger.warn(`Roast AI request failed with status ${response.status}`);
            return null;
        }

        const data = await response.json();
        const text = data?.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return text ? text.slice(0, 1900) : null;
    } catch (error) {
        logger.warn('Roast AI request errored:', error?.message || error);
        return null;
    }
}

async function trySmartAnswer(message) {
    const content = message.content.trim();
    const username = message.author.toString();

    // Cheap local handlers first — no API cost, instant.
    const weather = await answerWeather(content, username);
    if (weather) return weather;

    const time = answerTimeDate(content, username);
    if (time) return time;

    const math = answerMath(content, username);
    if (math) return math;

    // If a contextual comeback category matches, let the (free) roast
    // picker handle it instead of spending an AI call on banter like
    // "how are you" or "roast me".
    for (const category of CONTEXTUAL) {
        if (category.match !== CONTEXTUAL[CONTEXTUAL.length - 1].match && category.match.test(content)) {
            return null;
        }
    }

    // Anything else question-shaped → AI (only if the owner set a key).
    if (looksLikeQuestion(content)) {
        const ai = await answerWithAI(content, username);
        if (ai) return ai;
    }

    return null;
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

        // SMART LAYER FIRST — real questions get real answers (weather,
        // time, math, or AI for anything else), delivered in character.
        const smartAnswer = await trySmartAnswer(message);
        if (smartAnswer) {
            await message.channel.sendTyping();
            const smartDelay = 600 + Math.random() * 1200;
            setTimeout(() => {
                message.reply({ content: smartAnswer, allowedMentions: { repliedUser: true } }).catch((err) => {
                    logger.error('Failed to send smart roast reply:', err);
                });
            }, smartDelay);
            return true;
        }

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
