const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const { clientConfig } = require('../../util');
const { applicationPanels } = clientConfig;

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  // Getting our search query's results
  const queryResult = applicationPanels.filter(
    (applicationPanel) => applicationPanel.name.toLowerCase().indexOf(query) >= 0
  );

  // Structuring our result for Discord's API
  return queryResult
    .map((applicationPanel, ind) => ({
      name: applicationPanel.name, value: `${ ind }`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
} });

const applicationPanelOptionName = 'application-panel';
module.exports.applicationPanelOptionName = applicationPanelOptionName;
module.exports.applicationPanelOption = {
  type: ApplicationCommandOptionType.String,
  name: applicationPanelOptionName,
  description: 'The application panel to deploy',
  autocomplete: true,
  required: true
};
