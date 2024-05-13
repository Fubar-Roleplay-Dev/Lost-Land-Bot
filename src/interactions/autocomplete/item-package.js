const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const { ItemPackageModel } = require('../../mongo/ItemPackage');

const NO_PACKAGES_FOUND = 'No packages found';
module.exports.NO_PACKAGES_FOUND = NO_PACKAGES_FOUND;

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  const { guild } = interaction;

  const packages = await ItemPackageModel.find({ guildId: guild.id });
  if (!packages[0]) {
    return [
      {
        name: NO_PACKAGES_FOUND,
        value: NO_PACKAGES_FOUND
      }
    ];
  }

  // Getting our search query's results
  const queryResult = packages.filter(
    (e) => e.packageId.toLowerCase().indexOf(query) >= 0
  );

  // Structuring our result for Discord's API
  return queryResult
    .map((e) => ({
      name: e.packageId,
      value: e.packageId
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
} });

// Can't spread in required option if directly exported
// because the type will have been resolved
const itemPackageOptionIdentifier = 'item-package';
const itemPackageACOption = {
  type: ApplicationCommandOptionType.String,
  name: itemPackageOptionIdentifier,
  description: 'The item package to give/propose to the player',
  autocomplete: true,
  required: false
};
module.exports.itemPackageACOption = itemPackageACOption;
module.exports.itemPackageOptionIdentifier = itemPackageOptionIdentifier;

module.exports.requiredItemPackageACOption = {
  ...itemPackageACOption,
  required: true
};
