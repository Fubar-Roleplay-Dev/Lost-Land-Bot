const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const {
  ReactionRolePanel, ReactionRoleRow, ReactionRole
} = require('../../mongo/ReactionRolePanel');
const { rrPanelOptionIdentifier } = require('./reaction-role-panel');
const { rrGroupOptionIdentifier } = require('./reaction-role-group');

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  const { options, guild } = interaction;
  const panelId = options.getString(rrPanelOptionIdentifier);
  const rrPanel = await ReactionRolePanel.findById(panelId).catch(() => {});
  if (!rrPanel) return [
    {
      name: 'No panel selected', value: ''
    }
  ];

  const groupIdentifier = options.getString(rrGroupOptionIdentifier);
  const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
  if (!rrRow) return [
    {
      name: 'No row/group selected', value: ''
    }
  ];

  const allButtonRoles = await Promise.all(
    rrRow.reactionRoles
      .map(async (id) => {
        const rrButton = await ReactionRole.findById(id).catch(() => {});
        const role = guild.roles.cache.get(rrButton.roleId);
        return role
          ? {
            _id: rrButton._id, ...role
          }
          : {
            _id: rrButton._id, id: rrButton.roleId
          };
      })
  );

  if (!allButtonRoles || !allButtonRoles[0]) return [
    {
      name: 'No buttons for this group, please create one first',
      value: 'null'
    }
  ];

  // Getting our search query's results
  const queryResult = allButtonRoles.filter(
    (role) => role.name
      ? role.name.toLowerCase().indexOf(query) >= 0
      : role.id.toLowerCase().indexOf(query) >= 0
  );

  // Structuring our result for Discord's API
  return queryResult
    .map((role) => ({
      name: role.name ?? `<deleted role ${ role.id }>`, value: role._id
    }));
} });

const rrButtonOptionIdentifier = 'reaction-role-button';
module.exports.rrButtonOptionIdentifier = rrButtonOptionIdentifier;
module.exports.reactionRoleButtonNameOption = {
  name: rrButtonOptionIdentifier,
  description: 'The role given by the reaction role button',
  type: ApplicationCommandOptionType.String,
  autocomplete: true,
  required: true
};
