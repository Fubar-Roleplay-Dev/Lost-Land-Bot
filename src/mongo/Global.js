const { Schema, model } = require('mongoose');
const { MS_IN_ONE_HOUR } = require('../constants');

const globalSchema = Schema({ knownYoutubeVidIds: [ { type: String } ] }, { timestamps: true });

const GlobalModel = model('Global', globalSchema);
module.exports.GlobalModel = GlobalModel;

module.exports.globalCache = new Map();

module.exports.getGlobalCache = async () => {
  let data = this.globalCache.get();
  if (!this.globalCache.has()) {
    const globalSettings = await getGlobalsFromDB();
    data = globalSettings;
    this.globalCache.set(data);
  }
  setTimeout(() => {
    this.globalCache.delete();
  }, MS_IN_ONE_HOUR);
  return data;
};

const getGlobalsFromDB = async () => {
  let globalSettings;
  try {
    globalSettings = await GlobalModel.findOne();
    if (!globalSettings) {
      const newData = new GlobalModel({ knownYoutubeVidIds: [] });
      globalSettings = await newData.save();
    }
  }
  catch (err) {
    return console.error(err);
  }
  return globalSettings;
};
