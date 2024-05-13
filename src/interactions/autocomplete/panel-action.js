const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const { resolveAllTicketActions } = require('../../modules/ticket-config');
const ticketPanels = require('../../../config/tickets');

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  const allActions = resolveAllTicketActions();

  // Getting our search query's results
  // Note: Don't check (isCurrAction) because we can't defer
  // auto complete queries
  const queryResult = allActions.filter(
    (action) => action.buttonText?.toLowerCase().indexOf(query) >= 0
      || action.buttonEmoji?.indexOf(query) >= 0
      || action.panel.identifier.toLowerCase().indexOf(query) >= 0
  );

  // Structuring our result for Discord's API
  // Note: Emojis not supported in auto complete - so no need to use buttonName
  // Would also conflict with name sorter
  return queryResult
    .map((action) => ({
      name: `${ action.buttonText ?? action.buttonEmoji } (${ action.panel.identifier })`.slice(0, 100),
      value: `${ ticketPanels.indexOf(action.panel) }-${ action.panel.actions.indexOf(action) }`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
} });

// Can't spread in required option if directly exported
// because the type will have been resolved
const panelActionACOptionName = 'panel-action';
const panelActionACOption = {
  type: ApplicationCommandOptionType.String,
  name: panelActionACOptionName,
  description: 'Panel action to switch to',
  autocomplete: true,
  required: false
};
module.exports.panelActionACOption = panelActionACOption;
module.exports.panelActionACOptionName = panelActionACOptionName;

module.exports.requiredPanelActionACOption = {
  ...panelActionACOption,
  required: true
};
