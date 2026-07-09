// At top of execute function
if (subcommand === 'howtoearn' || subcommand === 'how-to-earn') {
  const embed = new EmbedBuilder()
    .setTitle('💰 How to Earn Money')
    .setColor(0x00ff00)
    .setDescription('Here are the main ways to earn coins in the economy:')
    .addFields(
      { name: 'Daily Reward', value: '`/daily` — Claim once per day (streak bonus!)', inline: true },
      { name: 'Work', value: '`/work` — Earn coins by working (cooldown applies)', inline: true },
      { name: 'Crime', value: '`/crime` — High risk, high reward', inline: true },
      { name: 'Gambling', value: '`/gamble <amount>` — Try your luck!', inline: true },
      { name: 'Shop Items', value: 'Sell items you buy from `/shop`', inline: true },
      { name: 'Leveling', value: 'Earn passive XP from chatting → level up rewards', inline: true }
    )
    .setFooter({ text: 'Tip: Use /balance to check your wallet!' });

  return interaction.reply({ embeds: [embed] });
}