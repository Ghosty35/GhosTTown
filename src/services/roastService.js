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

// ---------------------------------------------------------------------
// 0b) LINK CONCIERGE — builds direct search links from natural requests.
// No API keys needed: these are plain search URLs. Links are wrapped in
// <> so Discord doesn't spam the channel with giant embeds.
// ---------------------------------------------------------------------

function cleanQuery(raw) {
    return raw.replace(/[?!.]+$/g, '').replace(/^["'`]|["'`]$/g, '').trim();
}

function enc(q) {
    return encodeURIComponent(q);
}

function answerLinks(content, username) {
    // 🗺️ Directions: "directions from A to B", "route from A to B",
    // "how do I get from A to B"
    let m = content.match(/(?:directions?|route|how (?:do|can) i get)\s+(?:from\s+)?(.+?)\s+to\s+(.+)/i);
    if (m) {
        const from = cleanQuery(m[1]);
        const to = cleanQuery(m[2]);
        return (
            `🗺️ **${from} → ${to}**\n` +
            `<https://www.google.com/maps/dir/${enc(from)}/${enc(to)}>\n` +
            `There's your route, ${username}. GPS exists because of people like you.`
        );
    }

    // 🎵 Music: "find me the song X", "play X", "music X"
    m = content.match(/\b(?:song|music|track)\b\s*(?:called|named|by|for|about)?\s*[:\-]?\s*(.{2,80})/i) ||
        content.match(/^play\s+(.{2,80})/i);
    if (m) {
        const q = cleanQuery(m[1]);
        if (q) {
            return (
                `🎵 Looking for **${q}**? Here, ${username}:\n` +
                `▶️ YouTube: <https://www.youtube.com/results?search_query=${enc(q)}>\n` +
                `🟢 Spotify: <https://open.spotify.com/search/${enc(q)}>\n` +
                `🟠 SoundCloud: <https://soundcloud.com/search?q=${enc(q)}>\n` +
                `Your music taste is your business. Unfortunately.`
            );
        }
    }

    // 📰 News: "news about X", "X news", "game news", "gta 6 news"
    m = content.match(/\b(?:news|latest|updates?)\s+(?:about|on|for)\s+(.{2,60})/i) ||
        content.match(/^(.{2,60}?)\s+news\??$/i);
    if (m) {
        const q = cleanQuery(m[1]);
        if (q) {
            return (
                `📰 Fresh **${q}** news, ${username}:\n` +
                `<https://news.google.com/search?q=${enc(q)}>\n` +
                `▶️ Video coverage: <https://www.youtube.com/results?search_query=${enc(q + ' news')}&sp=CAI%253D>\n` +
                `Now you can be wrong about it with CONFIDENCE.`
            );
        }
    }

    // 🎬 Videos: "video of X", "watch X"
    m = content.match(/\b(?:videos?)\s+(?:of|about|for)\s+(.{2,80})/i) ||
        content.match(/^watch\s+(.{2,80})/i);
    if (m) {
        const q = cleanQuery(m[1]);
        return (
            `🎬 Videos of **${q}**:\n<https://www.youtube.com/results?search_query=${enc(q)}>\n` +
            `Enjoy the rabbit hole, ${username}. See you in 4 hours.`
        );
    }

    // 🖼️ Images: "images of X", "show me pictures of X"
    m = content.match(/\b(?:images?|pictures?|pics?|photos?)\s+of\s+(.{2,80})/i);
    if (m) {
        const q = cleanQuery(m[1]);
        return (
            `🖼️ Pictures of **${q}**:\n<https://www.google.com/search?q=${enc(q)}&tbm=isch>\n` +
            `You're welcome, ${username}. My eyes did the walking so yours don't have to.`
        );
    }

    // 😂 GIFs: "gif of X"
    m = content.match(/\bgifs?\s+(?:of|for)\s+(.{2,60})/i);
    if (m) {
        const q = cleanQuery(m[1]);
        return (
            `😂 GIFs of **${q}**:\n<https://tenor.com/search/${enc(q)}-gifs>\n` +
            `Because words are hard, right ${username}?`
        );
    }

    // 🔍 General search: "search for X", "google X", "look up X", "find me X"
    m = content.match(/^(?:search|google|look\s*up)\s+(?:for\s+|me\s+)?(.{2,100})/i) ||
        content.match(/^find\s+me\s+(.{2,100})/i);
    if (m) {
        const q = cleanQuery(m[1]);
        return (
            `🔍 I searched **${q}** so you didn't have to, ${username}:\n` +
            `<https://www.google.com/search?q=${enc(q)}>\n` +
            `🦆 Private mode: <https://duckduckgo.com/?q=${enc(q)}>\n` +
            `Bookmark google.com sometime. It's free.`
        );
    }

    return null;
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
                    'You are the resident roast-bot of a Discord server. ' +
                    'A member asked you a question in the roast channel. Answer it genuinely and correctly ' +
                    '(this is the priority — be actually helpful), wrapped in playful, PG-13 roast energy ' +
                    'aimed at the asker. Keep the humor about everyday relatable things (sleep schedules, ' +
                    'procrastination, phone habits, chat behavior) — do NOT reference server currencies, ' +
                    'games, or Discord-bot features. Light teasing only: never slurs, never cruelty about ' +
                    'real-life traits like appearance or identity, no adult content. Keep it under 120 words. ' +
                    `Plain text only, Discord-friendly. The member's display name is "${username}".`,
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

    // Link concierge — search / music / directions / news / videos /
    // images / gifs. Free (no API), so it runs before the AI layer.
    const links = answerLinks(content, username);
    if (links) return links;

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
            "Good morning {user}. It's 2 PM. Rough night or rough life?",
            "Sup {user}. Quick question — who invited you?",
            "{user} greeting the chat like the group project member who did nothing showing up to the presentation.",
        ],
    },
    {
        match: /\bhow (are|r) (you|u)\b|\bhow('?s| is) it going\b/i,
        lines: [
            "I was doing great until this notification, {user}.",
            "Better than your sleep schedule, {user}. But that's a low bar.",
            "I'm good. You, on the other hand, just asked a computer how it feels. Reflect on that, {user}.",
            "Thriving, {user}. You should try it sometime.",
        ],
    },
    {
        match: /\b(roast me|do your worst|come at me|try me)\b/i,
        lines: [
            "{user} asking to be roasted... your life choices already did my job for me.",
            "Roast you? {user}, your search history roasts you daily.",
            "I would, {user}, but bullying the pre-defeated feels wrong.",
            "You want a roast, {user}? Your camera roll of 4,000 unsorted screenshots says enough.",
            "Asking strangers online to insult you, {user}? Therapy is cheaper than you think.",
        ],
    },
    {
        match: /\b(bad bot|trash|garbage|dumb|stupid|shut up|stfu|useless|mid|you suck|u suck)\b/i,
        lines: [
            "Big words from someone who loses arguments to autocorrect, {user}.",
            "{user} calling ME dumb while their phone storage has been full since 2023.",
            "I'm 'useless'? {user}, you own a gym membership you've used twice.",
            "Careful {user}, I have a perfect memory and you have a search history.",
            "{user} typing insults with the same fingers that ordered delivery three days in a row.",
        ],
    },
    {
        match: /\b(love (you|u)|good bot|nice bot|best bot|thank(s| you)|ty)\b/i,
        lines: [
            "Aww, {user}. Say it to a human sometime — they miss you.",
            "Flattery from {user}? Now I KNOW you want something.",
            "Thanks {user}. This is the most affection you've given anything since your houseplant. Which died.",
        ],
    },
    {
        match: /\b(lol|lmao+|lmfao|haha+|xd|😂|🤣)\b/i,
        lines: [
            "Glad you're laughing, {user}. Your unread emails aren't.",
            "{user} laughing like their alarm isn't set for 6 AM with zero intention of getting up.",
            "Keep laughing {user}, your laundry pile has been 'getting done tomorrow' for a week.",
        ],
    },
    {
        match: /\b(i'?m rich|im rich|so much money|stack(ed|s)|balling|millionaire|billionaire)\b/i,
        lines: [
            "Rich? {user}, you screenshot your banking app when there's a good number in it.",
            "{user} flexing like they didn't check their account before ordering the large fries.",
            "Congrats on the money, {user}. Subscription services you forgot about would like a word.",
        ],
    },
    {
        match: /\b(sad|crying|cry|i lost|rip|pain|why me|unlucky)\b|😭|💀/i,
        lines: [
            "There there, {user}. Have you tried drinking water and going outside?",
            "{user} down bad AGAIN. At this point it's a lifestyle, not luck.",
            "Losses build character, {user}. You must have SO much character by now.",
            "It's okay {user}. Tomorrow is a new day for you to fumble too.",
        ],
    },
    {
        match: /\b(no u|no you|you too|ur mom|your mom)\b/i,
        lines: [
            "'No u'? Devastating, {user}. Truly the wordplay of a scholar.",
            "{user} really dusted off 'no u' from 2016. Your comebacks need a software update.",
        ],
    },
    {
        match: /\b(bye|goodnight|gn|cya|see ya|leaving|im out|i'?m out)\b/i,
        lines: [
            "Bye {user}! Best thing you've said all day.",
            "Goodnight {user}. 'Goodnight' meaning three more hours of scrolling, we both know.",
            "Leaving already, {user}? The average IQ of the chat just recovered.",
        ],
    },
    {
        match: /\?$/,
        lines: [
            "Great question, {user}. Almost as great as 'why am I like this?' — which you should also ask.",
            "{user}, I'd answer, but watching you figure it out is funnier.",
            "You're asking ME, {user}? Bold move from someone who googles 'how to boil egg'.",
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
    // ── Everyday life ──
    "{user} types like their keyboard is also trying to leave the conversation.",
    "You bring everyone so much joy, {user}. When you stop typing.",
    "{user}, your sleep schedule is a crime and you're the only witness.",
    "Somewhere your unread emails are multiplying, {user}, and you're HERE.",
    "{user} really said that with their whole chest and their 4% phone battery.",
    "Your wifi drops every time you're about to say something smart, {user}. Suspiciously convenient.",
    "{user}, you've had 'I'll start Monday' energy for six consecutive Mondays.",
    "You're not lazy, {user}. You're just in a committed relationship with your bed.",
    "{user} gives 'replies 'lol' and puts the phone face down' energy.",
    "Your camera roll is 90% screenshots you'll never look at again, {user}. Curate your life.",
    "{user}, you microwave food and still manage to burn it. Impressive, honestly.",
    "The gym misses you, {user}. Just kidding — it doesn't remember you.",
    "{user} has 47 open browser tabs and not one single plan.",
    "You hit snooze so much your alarm filed for divorce, {user}.",
    "{user}, your 'quick shower' has a longer runtime than most movies.",
    "Water has been waiting for you all day, {user}, and you chose your third energy drink.",
    "{user} is the person who says 'let's split it evenly' after ordering the most expensive thing.",
    "Your houseplant didn't die of thirst, {user}. It died of disappointment.",
    "{user}, you own more chargers than working braincells and STILL can't find one.",
    "Every group chat goes quiet when you type, {user}. That's not suspense.",
    "{user} would lose a staring contest with a mirror.",
    "You cancel plans and then feel lonely, {user}. The math isn't mathing.",
    "{user}, your 'five more minutes' is measured in geological time.",
    "The dishes in your sink have formed a government, {user}.",
    "{user}, you reply to texts in 0.2 seconds or 5 business days. No in between.",
    "Autocorrect gave up on you years ago, {user}. It just watches now.",
    "{user} is proof that 'main character energy' needs a better casting director.",
    "You've been 'about to go to sleep' for three hours, {user}. Commit to something.",
    "{user}, your comebacks buffer longer than your favorite show.",
    "You're not the worst, {user}. You're just consistently mid, which is somehow sadder.",
    "If overthinking burned calories, {user}, you'd be an athlete.",
    "{user}, even your shadow shows up late.",
    "I'm a bot and even I felt secondhand embarrassment reading that, {user}.",
    "Every server has a main character, {user}. You're the loading screen.",
    "NPCs have better dialogue than this, {user}.",
    // ── Server-flavored spice (kept small on purpose) ──
    "If Ls were GhostCoins you'd finally be rich, {user}.",
    "{user}, you're the reason the heist success rate is only 30%.",
    "{user} would lose a coinflip with a two-headed coin.",
    "The Server Exchange dips every time you go online, {user}. Coincidence? The data says no. 📉",
    "{user}, you couldn't hit 7️⃣7️⃣7️⃣ in a dream sequence.",
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

        // Decide the flavor: contextual > personal (15%) > generic.
        // Stat-based burns are kept rare on purpose — they hit harder
        // as an occasional surprise than as the bot's whole personality.
        let line = null;

        for (const category of CONTEXTUAL) {
            if (category.match.test(message.content)) {
                line = pick(category.lines);
                break;
            }
        }

        if (!line && Math.random() < 0.15) {
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
