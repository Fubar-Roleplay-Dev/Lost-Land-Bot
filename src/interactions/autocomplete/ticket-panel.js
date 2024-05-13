const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const ticketPanels = require('../../../config/tickets');

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  // Getting our search query's results
  const queryResult = ticketPanels.filter(
    (ticket) => ticket.identifier.toLowerCase().indexOf(query) >= 0
  );

  // Structuring our result for Discord's API
  return queryResult
    .map((ticket, ind) => ({
      name: ticket.identifier, value: `${ ind }`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
} });

const ticketPanelOptionName = 'ticket-panel';
module.exports.ticketPanelOptionName = ticketPanelOptionName;
module.exports.ticketPanelOption = {
  type: ApplicationCommandOptionType.String,
  name: ticketPanelOptionName,
  description: 'The ticket panel to execute this action on',
  autocomplete: true,
  required: true
};
