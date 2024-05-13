const { Schema, model } = require('mongoose');
const requiredString = {
  type: String, required: true
};

// Changelog-entry Dictionary
const entryMap = {
  'mod-update': 'Mod Update',
  'steam-update': 'Steam Update',
  'mod-added': 'Mod Added',
  'mod-removed': 'Mod Removed',
  'code-altered': 'Code Altered'
};
module.exports.entryMap = entryMap;

const entryTypes = {
  'mod-update': 'fix',
  'steam-update': 'fix',
  'mod-added': 'addition',
  'mod-removed': 'removal',
  'code-altered': 'fix'
};
module.exports.entryTypes = entryTypes;

const typeCommandChoices = Object.entries(entryMap).map(([ name, value ]) => ({
  name: value,
  value: name
}));
module.exports.typeCommandChoices = typeCommandChoices;

const changelogSchema = Schema({
  serverApiId: requiredString,
  ...(Object.entries(entryMap).reduce((accumulator, [ name, value ]) => {
    accumulator[name] = { type: [
      {
        data: requiredString,
        created_at: {
          type: Date, default: Date.now()
        },
        edited_at: {
          type: Date, default: null
        }
      }
    ] };
    return accumulator;
  }, {}))
}, { timestamps: true });
module.exports.changelogSchema = changelogSchema;

const ChangelogModel = model('Changelog', changelogSchema);
module.exports.ChangelogModel = ChangelogModel;

module.exports.getLatestLog = async (serverCfg) => await ChangelogModel
  .findOne({ serverApiId: serverCfg.CFTOOLS_SERVER_API_ID }, {}, { sort: { createdAt: -1 } })
  || await this.createChangelogEntry(serverCfg);

module.exports.createChangelogEntry = async (serverCfg) => {
  return await (new ChangelogModel({ serverApiId: serverCfg.CFTOOLS_SERVER_API_ID })).save();
};
