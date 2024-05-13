// Packages
const { stripIndents } = require('common-tags');
const { schedule } = require('node-cron');
const logger = require('@mirasaki/logger');

// Local
const {
  getLatestLog, createChangelogEntry, entryMap, entryTypes, typeCommandChoices
} = require('../mongo/Changelog');
const { colorResolver } = require('../util');
const { serverConfig } = require('./cftClient');
const { EMBED_DESCRIPTION_MAX_LENGTH } = require('../constants');

// Schedule a reset for our monthly changelog
const scheduleMonthlyReset = (client) => {
  // At 12:00am on the 1st
  schedule('0 0 1 * *', async () => {
    logger.info('[CRON] - Creating new Changelog Documents');
    for await (const serverCfg of serverConfig) {
      if (!serverCfg.CHANGELOG_ENABLED) continue;
      await createChangelogEntry(serverCfg);
      publishChangelog(client, serverCfg);
    }
  });
};

// Publish current changelog to channel
const publishChangelog = async (client, serverCfg) => {
  if (!serverCfg.CHANGELOG_ENABLED) return null;
  const targetChannel = await client.channels.fetch(serverCfg.CHANGELOG_CHANNEL_ID);
  if (!targetChannel) {
    logger.error(`[Changelog] - Unable to find channel with ID ${ serverCfg.CHANGELOG_CHANNEL_ID }`);
    return null;
  }
  const chMessages = (await targetChannel.messages.fetch({ limit: 100 }));
  const latestChangelogMessage = chMessages.find((msg) => {
    const isAuthor = msg.author.id === client.user.id;
    const messageEmbeds = msg?.embeds;
    return isAuthor && messageEmbeds && messageEmbeds[typeCommandChoices.length - 1];
  });

  // Create a new message if not updated or present
  if (
    !latestChangelogMessage
  ) return targetChannel.send({ embeds: await getChangelogEmbeds(client, serverCfg) });

  // Edit the existing message
  latestChangelogMessage.edit({ embeds: await getChangelogEmbeds(client, serverCfg) });
};

// Generate a changelog embed from data
const getChangelogEmbeds = async (client, serverCfg) => {
  // Fetching data from database
  const data = await getLatestLog(serverCfg);

  // Returning the final embed
  return Object.entries(entryTypes)
    .slice(0, 10) // 10 max
    .map(([ key, type ]) => {
      const str = stripIndents`
        \`\`\`${ type === 'fix' ? 'fix' : 'diff' }
          ${ data[key].map((e) => `${ type === 'fix' ? '•' : type === 'addition' ? '+' : '-' } ${ e.data }`).join('\n') || '• No entries yet' }
        \`\`\`
      `.slice(0, EMBED_DESCRIPTION_MAX_LENGTH);
      return {
        ...serverCfg.CHANGELOG_EMBED,
        title: `${ serverCfg.NAME }'s Changelog (${ entryMap[key] })`,
        color: colorResolver(serverCfg.CHANGELOG_EMBED?.color),
        description: str,
        footer: {
          text: key === 'mod-update'
            ? 'Please verify the integrity of your game files after mod updates'
            : serverCfg.CHANGELOG_EMBED.footer?.text ?? `Changelog ID: ${ data._id }`,
          icon_url: serverCfg.CHANGELOG_EMBED.footer?.icon_url ?? client.user.avatarURL()
        }
      };
    });
};

// Adds something to the current changelog
const addToChangelog = async (serverCfg, type, input) => {
  const data = await getLatestLog(serverCfg);
  data[type].push({ data: input });
  data.markModified(type);
  return await data.save();
};

// Remove an entry from the changelog
const removeFromChangelog = async (serverCfg, type, index) => {
  index = Number(index) - 1;
  const data = await getLatestLog(serverCfg);
  const removedData = data[type].splice(index, 1);
  data.markModified(type);
  await data.save();
  return removedData;
};

// Edit an existing changelog entry
const editChangelogEntry = async (serverCfg, type, index, newValue) => {
  index = Number(index) - 1;
  const data = await getLatestLog(serverCfg);
  const oldData = data[type][index];
  data[type].splice(index, 1, {
    ...oldData,
    data: newValue
  });
  data.markModified(type);
  await data.save();
  return oldData.data;
};


module.exports = {
  entryTypes,
  scheduleMonthlyReset,
  publishChangelog,
  getChangelogEmbeds,
  addToChangelog,
  removeFromChangelog,
  editChangelogEntry
};
