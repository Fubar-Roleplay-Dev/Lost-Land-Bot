const { Schema, model } = require('mongoose');

const ReactionRoleSchema = Schema({
  text: String,
  description: String,
  color: String,
  emoji: String,
  roleId: String,
  emojiOnly: {
    type: Boolean,
    default: false
  }
});


const ReactionRole = model('ReactionRole', ReactionRoleSchema);
module.exports.ReactionRole = ReactionRole;

const reactionRolePanelRowSchema = Schema({
  name: String,
  reactionRoles: [
    {
      type: Schema.Types.ObjectId,
      ref: 'ReactionRole'
    }
  ]
});

const ReactionRoleRow = model('ReactionRoleRow', reactionRolePanelRowSchema);
module.exports.ReactionRoleRow = ReactionRoleRow;

const reactionRolePanelSchema = Schema({
  _guildId: {
    type: String,
    required: true
  },
  _settingsId: {
    type: Schema.Types.ObjectId,
    ref: 'Settings'
  },
  hasEmbedOverview: {
    type: Boolean,
    default: true
  },
  name: String,
  title: String,
  message: String,
  color: String,
  reactionRoleRows: [
    {
      type: Schema.Types.ObjectId,
      ref: 'ReactionRoleRow'
    }
  ]
}, { timestamps: true });

const ReactionRolePanel = model('ReactionRolePanel', reactionRolePanelSchema);
module.exports.ReactionRolePanel = ReactionRolePanel;

module.exports.getRRPanels = async (guildId) => {
  let rrPanels;
  try {
    rrPanels = await ReactionRolePanel.find({ _guildId: guildId });
  }
  catch (err) {
    console.error(err);
    return null;
  }
  return rrPanels;
};
