const { ApplicationCommandOptionType } = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const { getRRPanels } = require('../../mongo/ReactionRolePanel');

module.exports = new ComponentCommand({ run: async (client, interaction, query) => {
  const { guild } = interaction;
  const data = await getRRPanels(guild.id);
  if (!data || !data[0]) return [
    {
      name: 'No panels, please create one first',
      value: 'null'
    }
  ];
  if (!query) return data.map((e) => ({
    name: e.name, value: e._id
  }));
  else return data
    .filter((e) => e.name.toLowerCase().indexOf(query.toLowerCase()) >= 0)
    .map((e) => ({
      name: e.name, value: e._id
    }));
} });

const rrPanelOptionIdentifier = 'reaction-role-panel';
module.exports.rrPanelOptionIdentifier = rrPanelOptionIdentifier;
module.exports.reactionRolePanelNameOption = {
  name: rrPanelOptionIdentifier,
  description: 'The name of the reaction role panel',
  type: ApplicationCommandOptionType.String,
  autocomplete: true,
  required: true
};
