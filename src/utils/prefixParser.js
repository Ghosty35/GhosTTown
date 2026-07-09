// Inside mapArgumentsToOptions
if (args.length > 0) {
  const resolvedSubcommand = resolveSubcommandAlias(args[0]);
  const sub = subcommands.find((s) => s.name === resolvedSubcommand);
  if (sub) {
    subcommandName = resolvedSubcommand;
    // ...
  } else if (resolvedSubcommand === 'howtoearn') {
    subcommandName = 'howtoearn'; // explicit fallback
  }
}
