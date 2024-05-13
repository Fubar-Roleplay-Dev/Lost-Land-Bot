const ticketPanels = require('../../config/tickets');

const resolveOverridableConfigKey = (key, {
  ticketPanel, action, serverIdentifier
}) => {
  const internal = action[key] ?? ticketPanel[key] ?? null;
  if (
    serverIdentifier
    && ticketPanel.serverMapping
    && ticketPanel.serverMapping[serverIdentifier]
  ) return ticketPanel.serverMapping[serverIdentifier][key] ?? internal;

  return internal;
};

const resolveAllTicketActions = () => ticketPanels
  .map((ticketPanel) => ticketPanel.actions
    .filter((action) => action)
    .map((action) => {
      action.panel = ticketPanel;
      return action;
    })).flat();

module.exports = {
  resolveOverridableConfigKey,
  resolveAllTicketActions
};
