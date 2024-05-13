const { Schema, model } = require('mongoose');
const { MS_IN_ONE_HOUR } = require('../constants');

const settingSchema = Schema({ _guildId: {
  type: String, required: true
} }, { timestamps: true });

const GuildModel = model('Settings', settingSchema);
module.exports.GuildModel = GuildModel;

module.exports.settingsCache = new Map();

module.exports.getSettingsCache = async (guildId) => {
  let data = this.settingsCache.get(guildId);
  if (!this.settingsCache.has(guildId)) {
    const guildSettings = await getSettingsFromDB(guildId);
    data = guildSettings;
    this.settingsCache.set(guildId, data);
  }
  setTimeout(() => {
    this.settingsCache.delete(guildId);
  }, MS_IN_ONE_HOUR);
  return data;
};

const getSettingsFromDB = async (_guildId) => {
  let guildSettings;
  try {
    guildSettings = await GuildModel.findOne({ _guildId });
    if (!guildSettings) {
      const newData = new GuildModel({ _guildId });
      guildSettings = await newData.save();
    }
  }
  catch (err) {
    return console.error(err);
  }
  return guildSettings;
};
