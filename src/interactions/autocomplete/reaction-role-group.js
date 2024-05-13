const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const { ReactionRolePanel, ReactionRoleRow } = require('../../mongo/ReactionRolePanel');
const { rrPanelOptionIdentifier } = require('./reaction-role-panel');

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  const { options } = interaction;
  const panelId = options.getString(rrPanelOptionIdentifier);
  const rrPanel = await ReactionRolePanel.findById(panelId).catch(() => {});
  if (!rrPanel) return [
    {
      name: 'No panel selected', value: ''
    }
  ];

  const allRows = await Promise.all(rrPanel.reactionRoleRows.map((id) => ReactionRoleRow.findById(id).catch(() => {})));

  if (!allRows || !allRows[0]) return [
    {
      name: 'No groups for this panel, please create one first',
      value: 'null'
    }
  ];

  // Getting our search query's results
  const queryResult = allRows.filter(
    (rrRow) => rrRow && rrRow.name.toLowerCase().indexOf(query) >= 0
  );

  // Structuring our result for Discord's API
  return queryResult
    .map((rrRow) => ({
      name: rrRow.name, value: rrRow._id
    }));
} });

const rrGroupOptionIdentifier = 'reaction-role-group';
module.exports.rrGroupOptionIdentifier = rrGroupOptionIdentifier;
module.exports.reactionRoleGroupNameOption = {
  name: rrGroupOptionIdentifier,
  description: 'The name of the reaction role group/row',
  type: ApplicationCommandOptionType.String,
  autocomplete: true,
  required: true
};
