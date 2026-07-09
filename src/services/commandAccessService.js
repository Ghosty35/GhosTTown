// In isCommandEnabledInConfig
if (commandName === 'setup' && ['howtoearn', 'how-to-earn'].includes(subcommand)) {
  return true; // always enabled
}
