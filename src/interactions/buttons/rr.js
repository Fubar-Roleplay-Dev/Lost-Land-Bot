const { ComponentCommand } = require('../../classes/Commands');
const { ReactionRole } = require('../../mongo/ReactionRolePanel');

module.exports = new ComponentCommand({ run: async (client, interaction) => {
  const { member, guild } = interaction;
  const { emojis } = client.container;
  // eslint-disable-next-line no-unused-vars
  const [ action, rrActionId ] = interaction.customId.split('@');
  await interaction.deferReply({ ephemeral: true });

  // Validate still exists
  const rrButton = await ReactionRole.findById(rrActionId).catch(() => {});
  if (!rrButton) {
    interaction.editReply(`${ emojis.error } ${ member }, that reaction role is no longer active. Please notify the administrators. This action has been cancelled.`);
    return;
  }

  // Check role still exists
  const { roleId } = rrButton;
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    interaction.editReply(`${ emojis.error } ${ member }, the role associated to this role reward no longer exists. Please notify the administrators. This action has been cancelled.`);
    return;
  }

  // Check role position
  if (role.position >= guild.members.me.roles.highest?.position) {
    interaction.editReply({
      content: `${ emojis.error } ${ member }, the role ${ role } has a higher or equal position in the role list as my highest role; This means I can't give the role to members. Please notify the administrators to either move my highest role up the role-list or provide a role with a lower position instead - this action has been cancelled`,
      disableMentions: true
    });
    return;
  }

  // Toggle the role
  const hasRole = member._roles.includes(roleId);
  try {
    if (hasRole) await member.roles.remove(roleId, 'Reaction Role - toggle, role removed');
    else await member.roles.add(roleId, 'Reaction Role - toggle, role added');
  }
  catch (err) {
    interaction.editReply(`${ emojis.error } ${ member }, error encountered while ${
      hasRole ? 'removing' : 'assigning'
    } role: ${ err.message }`);
    return;
  }

  // User feedback
  interaction.editReply(`${ emojis.success } ${ member }, I have ${
    hasRole ? 'remove your' : 'given you the'
  } role ${ role }`);
} });
