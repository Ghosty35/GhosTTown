// Shop catalog — ordered by category for a clean browsing experience:
// 🛠️ Tools → ⚡ Upgrades → 🍀 Consumables → 📜 Job Licenses → ⭐ VIP
// Every item has an `emoji` field used in the shop menu and buy buttons.

export const shopItems = [
    // ══════════════════════ 🛠️ TOOLS ══════════════════════
    {
        id: 'fishing_rod',
        name: 'Fishing Rod',
        emoji: '🎣',
        price: 5000,
        description: 'Standard-issue rod. Required gear for `/fish`.',
        type: 'tool',
        durability: 100,
        effect: { type: 'fishing_yield', multiplier: 1.0 }
    },
    {
        id: 'pickaxe',
        name: 'Pickaxe',
        emoji: '⛏️',
        price: 7500,
        description: 'Sturdy iron pickaxe. Boosts `/mine` yield by 20%.',
        type: 'tool',
        durability: 100,
        effect: { type: 'mining_yield', multiplier: 1.2 }
    },
    {
        id: 'laptop',
        name: 'Laptop',
        emoji: '💻',
        price: 15000,
        description: 'Work smarter, not harder — boosts `/work` earnings by 50%.',
        type: 'tool',
        durability: 200,
        effect: { type: 'work_yield', multiplier: 1.5 }
    },
    {
        id: 'diamond_pickaxe',
        name: 'Diamond Pickaxe',
        emoji: '💎',
        price: 50000,
        description: 'Top-tier mining gear — doubles your `/mine` yield.',
        type: 'tool',
        durability: 100,
        effect: { type: 'mining_yield', multiplier: 2.0 }
    },
    {
        id: 'bank_note',
        name: 'Bank Note',
        emoji: '📜',
        price: 25000,
        description: 'Adds +$10,000 bank capacity. Stack as many as you like.',
        type: 'tool',
        durability: null,
        effect: { type: 'bank_capacity', increase: 10000 }
    },
    {
        id: 'personal_safe',
        name: 'Personal Safe',
        emoji: '🔒',
        price: 30000,
        description: 'Robbery protection — nobody can `/rob` your wallet.',
        type: 'tool',
        durability: null,
        effect: { type: 'robbery_protection', protection: true }
    },

    // ══════════════════════ ⚡ UPGRADES ══════════════════════
    {
        id: 'bank_upgrade_1',
        name: 'Bank Upgrade I',
        emoji: '🏦',
        price: 15000,
        description: 'Expands your vault — bank capacity ×1.5, permanently.',
        type: 'upgrade',
        maxLevel: 5,
        effect: { type: 'bank_capacity', multiplier: 1.5 }
    },
    {
        id: 'premium_role',
        name: 'Premium Server Role',
        emoji: '👑',
        price: 15000,
        description: 'Exclusive Premium role + a permanent 10% `/daily` bonus.',
        type: 'role',
        roleId: null,
        effect: { type: 'daily_bonus', multiplier: 1.1 }
    },

    // ══════════════════════ 🍀 CONSUMABLES ══════════════════════
    {
        id: 'extra_work',
        name: 'Extra Work Shift',
        emoji: '💼',
        price: 5000,
        description: 'Skip the `/work` cooldown once — clock in for an extra shift.',
        type: 'consumable',
        maxQuantity: 5,
        cooldown: 86400000,
        effect: { type: 'command_boost', command: 'work', uses: 1 }
    },
    {
        id: 'lucky_clover',
        name: 'Lucky Clover',
        emoji: '☘️',
        price: 10000,
        description: 'One-shot luck boost — 1.5× win odds on your next `/gamble`.',
        type: 'consumable',
        maxQuantity: 10,
        effect: { type: 'gamble_boost', multiplier: 1.5, uses: 1 }
    },
    {
        id: 'lucky_charm',
        name: 'Lucky Charm',
        emoji: '🍀',
        price: 10000,
        description: 'Gambling luck boost (1.3×) that lasts for 3 uses.',
        type: 'consumable',
        maxQuantity: 10,
        effect: { type: 'gamble_boost', multiplier: 1.3, uses: 3 }
    },

    // ══════════════════════ 📜 JOB LICENSES ══════════════════════
    // One-time purchase, required before /job apply for that career.
    {
        id: 'license_delivery_driver',
        name: 'Delivery Driver License',
        emoji: '🚚',
        price: 20000,
        description: 'Start your career on the road. Pays $90,000–$150,000/week.',
        type: 'license'
    },
    {
        id: 'license_chef',
        name: 'Chef License',
        emoji: '👨‍🍳',
        price: 24000,
        description: 'Run the kitchen. Pays $105,000–$165,000/week.',
        type: 'license'
    },
    {
        id: 'license_car_mechanic',
        name: 'Car Mechanic License',
        emoji: '🔧',
        price: 28000,
        description: 'Certified under the hood. Pays $120,000–$195,000/week.',
        type: 'license'
    },
    {
        id: 'license_scammer',
        name: 'Scammer License',
        emoji: '🎭',
        price: 32000,
        description: 'Officially licensed to hustle. Pays $135,000–$240,000/week.',
        type: 'license'
    },
    {
        id: 'license_bank_manager',
        name: 'Bank Manager License',
        emoji: '🏦',
        price: 40000,
        description: 'Run Ghost Savings & Loans. Pays $180,000–$270,000/week.',
        type: 'license'
    },
    {
        id: 'license_hacker',
        name: 'Hacker License',
        emoji: '💻',
        price: 50000,
        description: 'The top of the food chain. Pays $210,000–$330,000/week.',
        type: 'license'
    },

    // ══════════════════════ ⭐ VIP ══════════════════════
    {
        id: 'vip_access',
        name: 'VIP Access',
        emoji: '⭐',
        price: 20000,
        description: 'Permanent access to the exclusive VIP area of the server.',
        type: 'access_role'
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'Item not found' };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `You can only have a maximum of ${item.maxQuantity} ${item.name}s` 
            };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `You've already purchased ${item.name}` 
            };
        }
    }

    if (item.type === 'tool') {
        
        const currentQuantity = inventory[itemId] || 0;
        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `You already have a ${item.name}` 
            };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `You already have the ${item.name} role` 
            };
        }
    }

    // NEW: color roles, access roles, and job licenses are one-time
    // purchases, tracked the same way as tools/consumables — in
    // userData.inventory.
    if ((item.type === 'color_role' || item.type === 'access_role' || item.type === 'license') && inventory[itemId]) {
        return {
            valid: false,
            reason: `You already own ${item.name}`
        };
    }

    return { valid: true };
}
