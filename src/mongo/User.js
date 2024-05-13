const { Schema, model } = require('mongoose');

const userSchema = Schema({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  steamId: {
    type: String, default: null
  }
}, { timestamps: true });

const UserModel = model('users', userSchema);
module.exports.UserModel = UserModel;

module.exports.getUser = async (discordId) => {
  const user = await UserModel.findOne({ discordId });
  if (user) return user;
  else return await UserModel.create({ discordId });
};
