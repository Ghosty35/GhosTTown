// jobs.js
//
// Catalog of jobs members can apply for via /job apply. Each job requires
// owning the matching license (bought from the shop) before applying.
// Pay is credited automatically once a week per job — see jobsService.js.

export const jobs = [
    {
        id: 'bank_manager',
        name: 'Bank Manager',
        emoji: '🏦',
        description: 'Keep Ghost Savings and Loans running smoothly.',
        weeklyPay: { min: 180000, max: 270000 },
        licenseId: 'license_bank_manager',
    },
    {
        id: 'car_mechanic',
        name: 'Car Mechanic',
        emoji: '🔧',
        description: 'Fix up rides for the townsfolk.',
        weeklyPay: { min: 120000, max: 195000 },
        licenseId: 'license_car_mechanic',
    },
    {
        id: 'scammer',
        name: 'Scammer',
        emoji: '🎭',
        description: 'Run "creative" business schemes around town.',
        weeklyPay: { min: 135000, max: 240000 },
        licenseId: 'license_scammer',
    },
    {
        id: 'hacker',
        name: 'Hacker',
        emoji: '💻',
        description: 'Break into systems nobody asked you to break into.',
        weeklyPay: { min: 210000, max: 330000 },
        licenseId: 'license_hacker',
    },
    {
        id: 'delivery_driver',
        name: 'Delivery Driver',
        emoji: '🚚',
        description: 'Haul packages across GhostTown, rain or shine.',
        weeklyPay: { min: 90000, max: 150000 },
        licenseId: 'license_delivery_driver',
    },
    {
        id: 'chef',
        name: 'Chef',
        emoji: '👨‍🍳',
        description: 'Cook up a storm at the local diner.',
        weeklyPay: { min: 105000, max: 165000 },
        licenseId: 'license_chef',
    },
];

export function getJobById(id) {
    return jobs.find((j) => j.id === id);
}
